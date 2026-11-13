using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var jwtKey = LoadKey();
var b = WebApplication.CreateBuilder(args);
b.Services.AddDbContext<Db>(o => o.UseSqlite("Data Source=reliefnet.db"));
b.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173").AllowAnyHeader().AllowAnyMethod()));
b.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = "ReliefNet", ValidateAudience = true, ValidAudience = "ReliefNet",
        ValidateLifetime = true, ValidateIssuerSigningKey = true, ClockSkew = TimeSpan.FromMinutes(1),
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    });
b.Services.AddAuthorization();
b.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("strict", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "local",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = b.Build();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

using (var s = app.Services.CreateScope())
{
    var db = s.ServiceProvider.GetRequiredService<Db>();
    db.Database.EnsureCreated();
    if (!db.Users.Any())
    {
        var pw = Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? "coord123";
        var salt = RandomNumberGenerator.GetBytes(16);
        db.Users.Add(new User { Username = "coordinator", Name = "Coordinator", Salt = Convert.ToBase64String(salt), PasswordHash = Hash(pw, salt) });
        db.SaveChanges();
    }
}

// ---------- Auth ----------
app.MapPost("/api/auth/login", async (LoginDto d, Db db) =>
{
    var u = await db.Users.FirstOrDefaultAsync(x => x.Username == d.Username);
    if (u == null || !Verify(d.Password ?? "", u)) return Results.Unauthorized();
    var jwt = new JwtSecurityToken("ReliefNet", "ReliefNet",
        new[] { new Claim(ClaimTypes.Name, u.Username), new Claim(ClaimTypes.Role, "Coordinator") },
        expires: DateTime.UtcNow.AddHours(8),
        signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)), SecurityAlgorithms.HmacSha256));
    return Results.Ok(new { name = u.Name, token = new JwtSecurityTokenHandler().WriteToken(jwt) });
}).RequireRateLimiting("strict");

// ---------- Requests ----------
app.MapPost("/api/requests", async (RequestIn i, Db db) =>
{
    if (string.IsNullOrWhiteSpace(i.Name) || i.Name.Length > 100 || !Regex.IsMatch(i.Phone ?? "", @"^0\d{9}$") ||
        string.IsNullOrWhiteSpace(i.Location) || i.Location.Length > 100 ||
        i.Type is not ("Food" or "Shelter" or "Other") || (i.Info?.Length ?? 0) > 1000 || (i.Email?.Length ?? 0) > 150)
        return Results.BadRequest("Invalid request data.");
    var (score, factors) = Score(i.Info ?? "", i.Type);
    var r = new HelpRequest
    {
        Name = i.Name.Trim(), Phone = i.Phone!, Email = i.Email?.Trim() ?? "", Location = i.Location.Trim(), Type = i.Type,
        Info = i.Info ?? "", Score = score, FactorsJson = JsonSerializer.Serialize(factors), Status = "Pending", Date = Today()
    };
    db.Requests.Add(r);
    await db.SaveChangesAsync();
    return Results.Ok(new { id = r.Id, score, factors, status = r.Status, name = r.Name });
});

// public: requester checks own status with request number + phone
app.MapPost("/api/requests/track", async (TrackDto t, Db db) =>
{
    var r = await db.Requests.FindAsync(t.Id);
    if (r == null || r.Phone != t.Phone) return Results.NotFound();
    return Results.Ok(new { id = r.Id, status = r.Status, type = r.Type, date = r.Date });
}).RequireRateLimiting("strict");

app.MapGet("/api/requests", async (string? status, string? q, Db db) =>
{
    var query = db.Requests.AsQueryable();
    if (!string.IsNullOrEmpty(status) && status != "All") query = query.Where(r => r.Status == status);
    if (!string.IsNullOrWhiteSpace(q))
    {
        int.TryParse(new string(q.Where(char.IsDigit).ToArray()), out var idq);
        query = query.Where(r => r.Name.Contains(q) || r.Location.Contains(q) || (idq > 0 && r.Id == idq));
    }
    return await query.OrderByDescending(r => r.Score).ThenByDescending(r => r.Id)
        .Select(r => new { r.Id, r.Name, r.Location, r.Type, r.Score, r.Status, r.Date }).ToListAsync();
}).RequireAuthorization();

app.MapPut("/api/requests/{id:int}/status", async (int id, StatusDto d, Db db) =>
{
    if (d.Status is not ("Approved" or "Rejected")) return Results.BadRequest();
    var r = await db.Requests.FindAsync(id);
    if (r == null) return Results.NotFound();
    if (r.Status != "Pending") return Results.Conflict("Already decided.");
    r.Status = d.Status;
    if (d.Status == "Approved")
        db.Deliveries.Add(new Delivery { Beneficiary = r.Name, AidType = r.Type == "Shelter" ? "Shelter" : "Food Package", Status = "Pending", Date = Today() });
    var subject = "ReliefNet: request " + d.Status.ToLower();
    var body = d.Status == "Approved"
        ? $"Dear {r.Name},\nYour request for {r.Type} assistance has been approved.\nLocation: {r.Location}\nOur team will get in touch with you shortly.\nStay safe and take care."
        : $"Dear {r.Name},\nWe are sorry, your request could not be approved at this time. Please contact us for help.";
    db.Emails.Add(new EmailLog { To = r.Email, Subject = subject, Body = body, Sent = DateTime.UtcNow });
    await db.SaveChangesAsync();
    TrySmtp(r.Email, subject, body);
    return Results.Ok(new { r.Id, r.Status });
}).RequireAuthorization();

// ---------- Deliveries / emails ----------
app.MapGet("/api/deliveries", async (Db db) => await db.Deliveries.OrderByDescending(d => d.Id).ToListAsync()).RequireAuthorization();
app.MapPut("/api/deliveries/{id:int}", async (int id, StatusDto d, Db db) =>
{
    if (d.Status is not ("Pending" or "In Progress" or "Delivered")) return Results.BadRequest();
    var x = await db.Deliveries.FindAsync(id);
    if (x == null) return Results.NotFound();
    x.Status = d.Status; await db.SaveChangesAsync();
    return Results.Ok(x);
}).RequireAuthorization();
app.MapGet("/api/emails", async (Db db) => await db.Emails.OrderByDescending(e => e.Id).ToListAsync()).RequireAuthorization();

// ---------- Donors / volunteers ----------
app.MapPost("/api/donors", async (DonorIn i, Db db) =>
{
    if (string.IsNullOrWhiteSpace(i.Name) || i.Name.Length > 100 || string.IsNullOrWhiteSpace(i.Amount) || i.Amount.Length > 100) return Results.BadRequest();
    db.Donors.Add(new Donor { Name = i.Name.Trim(), Amount = i.Amount.Trim(), Date = Today(), Status = "Pending" });
    await db.SaveChangesAsync(); return Results.Ok();
});
app.MapGet("/api/donors", async (Db db) => await db.Donors.OrderByDescending(d => d.Id).ToListAsync()).RequireAuthorization();
app.MapPost("/api/volunteers", async (VolunteerIn i, Db db) =>
{
    if (string.IsNullOrWhiteSpace(i.Name) || i.Name.Length > 100 || (i.Skills?.Length ?? 0) > 50) return Results.BadRequest();
    db.Volunteers.Add(new Volunteer { Name = i.Name.Trim(), Skills = i.Skills ?? "General", Status = "Pending" });
    await db.SaveChangesAsync(); return Results.Ok();
});
app.MapGet("/api/volunteers", async (Db db) => await db.Volunteers.OrderByDescending(v => v.Id).ToListAsync()).RequireAuthorization();

app.Run("http://localhost:5000");

// ---------- helpers ----------
static string Today() => DateTime.Now.ToString("yyyy-MM-dd");
static string Hash(string pw, byte[] salt) => Convert.ToBase64String(Rfc2898DeriveBytes.Pbkdf2(pw, salt, 100_000, HashAlgorithmName.SHA256, 32));
static bool Verify(string pw, User u) =>
    CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(Hash(pw, Convert.FromBase64String(u.Salt))), Convert.FromBase64String(u.PasswordHash));

static string LoadKey()
{
    var e = Environment.GetEnvironmentVariable("JWT_KEY");
    if (!string.IsNullOrEmpty(e) && e.Length >= 32) return e;
    const string f = "jwt.key";
    if (File.Exists(f)) return File.ReadAllText(f).Trim();
    var k = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
    File.WriteAllText(f, k); return k;
}

static (int, List<Factor>) Score(string info, string type)
{
    var t = (info + " " + type).ToLower(); var f = new List<Factor>();
    if (t.Contains("child") || t.Contains("baby") || t.Contains("kid")) f.Add(new("Children present", 30));
    if (t.Contains("no food") || t.Contains("hungry") || t.Contains("2 days")) f.Add(new("No food for 2 days", 25));
    if (t.Contains("flood") || t.Contains("landslide")) f.Add(new("Flood affected area", 20));
    if (t.Contains("elder") || t.Contains("disab") || t.Contains("pregnan") || t.Contains("medical")) f.Add(new("Vulnerable household", 10));
    if (type == "Shelter") f.Add(new("Needs shelter", 15));
    return (Math.Min(100, f.Sum(x => x.Points) + 10), f);
}

static void TrySmtp(string to, string subject, string body)
{
    var host = Environment.GetEnvironmentVariable("SMTP_HOST");
    if (host == null || string.IsNullOrWhiteSpace(to)) return;
    try
    {
        var user = Environment.GetEnvironmentVariable("SMTP_USER")!;
        using var c = new SmtpClient(host, 587) { EnableSsl = true, Credentials = new NetworkCredential(user, Environment.GetEnvironmentVariable("SMTP_PASS")) };
        c.Send(new MailMessage(user, to, subject, body));
    }
    catch { }
}

record Factor(string Label, int Points);
record LoginDto(string? Username, string? Password);
record StatusDto(string? Status);
record TrackDto(int Id, string? Phone);
record RequestIn(string? Name, string? Phone, string? Email, string? Location, string? Type, string? Info);
record DonorIn(string? Name, string? Amount);
record VolunteerIn(string? Name, string? Skills);

class User { public int Id { get; set; } public string Username { get; set; } = ""; public string Name { get; set; } = ""; public string PasswordHash { get; set; } = ""; public string Salt { get; set; } = ""; }
class HelpRequest { public int Id { get; set; } public string Name { get; set; } = ""; public string Phone { get; set; } = ""; public string Email { get; set; } = ""; public string Location { get; set; } = ""; public string Type { get; set; } = ""; public string Info { get; set; } = ""; public int Score { get; set; } public string FactorsJson { get; set; } = "[]"; public string Status { get; set; } = "Pending"; public string Date { get; set; } = ""; }
class Delivery { public int Id { get; set; } public string Beneficiary { get; set; } = ""; public string AidType { get; set; } = ""; public string Status { get; set; } = ""; public string Date { get; set; } = ""; }
class Donor { public int Id { get; set; } public string Name { get; set; } = ""; public string Amount { get; set; } = ""; public string Date { get; set; } = ""; public string Status { get; set; } = ""; }
class Volunteer { public int Id { get; set; } public string Name { get; set; } = ""; public string Skills { get; set; } = ""; public string Status { get; set; } = ""; }
class EmailLog { public int Id { get; set; } public string To { get; set; } = ""; public string Subject { get; set; } = ""; public string Body { get; set; } = ""; public DateTime Sent { get; set; } }

class Db : DbContext
{
    public Db(DbContextOptions<Db> o) : base(o) { }
    public DbSet<User> Users => Set<User>();
    public DbSet<HelpRequest> Requests => Set<HelpRequest>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<Donor> Donors => Set<Donor>();
    public DbSet<Volunteer> Volunteers => Set<Volunteer>();
    public DbSet<EmailLog> Emails => Set<EmailLog>();
    protected override void OnModelCreating(ModelBuilder m) => m.Entity<User>().HasIndex(u => u.Username).IsUnique();
}
