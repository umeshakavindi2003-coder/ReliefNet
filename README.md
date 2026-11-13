# ReliefNet
## Backend (C# .NET 8, SQLite + JWT)
cd backend && dotnet run        # http://localhost:5000
- Database file reliefnet.db is created automatically (data is kept after restart).
- JWT signing key is generated once into backend/jwt.key (or set JWT_KEY, 32+ chars).
- First run creates user "coordinator". Password = ADMIN_PASSWORD env var, default coord123 (change it!).
- To reset everything: stop the backend and delete reliefnet.db.
## Frontend (React + Vite)
cd frontend && npm install && npm run dev   # http://localhost:5173
Optional email: set SMTP_HOST, SMTP_USER, SMTP_PASS before dotnet run.
