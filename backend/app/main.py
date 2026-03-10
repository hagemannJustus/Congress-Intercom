from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter
from .schema import schema
from .database import engine, Base
import asyncio

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi import File, UploadFile
import os
import uuid

app = FastAPI(title="Magic Link Backend")

# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Static files for uploaded images
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import shutil

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    base_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    return {"url": f"{base_url}/uploads/{filename}"}

# Initialize database tables on startup
@app.on_event("startup")
async def on_startup():
    # Step 1: create all tables (committed immediately)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Step 2: run column migrations in a fresh connection (tables now visible to PRAGMA)
    async def add_column_if_missing(table, column_def):
        from sqlalchemy import text
        async with engine.begin() as conn:
            result = await conn.execute(text(f"PRAGMA table_info({table})"))
            cols = [row[1] for row in result.fetchall()]
            if column_def[0] not in cols:
                await conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN {column_def[0]} {column_def[1]}"
                ))

    await add_column_if_missing("project_members", ("is_removed", "INTEGER NOT NULL DEFAULT 0"))
    await add_column_if_missing("project_members", ("last_online", "DATETIME"))
    await add_column_if_missing("project_members", ("typing_until", "DATETIME"))
    await add_column_if_missing("project_members", ("operator_typing_until", "DATETIME"))
    await add_column_if_missing("messages", ("is_read", "INTEGER NOT NULL DEFAULT 0"))
    await add_column_if_missing("agents", ("gemini_api_key", "VARCHAR(100)"))



# GraphQL setup with Strawberry
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")

@app.get("/")
def read_root():
    return {"message": "Server is up and running. Use the /graphql endpoint."}

# Verification endpoint
@app.get("/verify")
async def verify_token(token: str):
    from .services.auth import verify_magic_link_token
    from .database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        email, error = await verify_magic_link_token(db, token)
        if error:
            return {"success": False, "error": error}
        
        # Redirect to the local app
        from fastapi.responses import RedirectResponse
        import os
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        app_url = f"{frontend_url}/verify?token={token}"
        return RedirectResponse(url=app_url)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
