import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./fegg.db")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-prod")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7


E2B_API_KEY = os.getenv("E2B_API_KEY")
E2B_TEMPLATE_ID = os.getenv("E2B_TEMPLATE_ID", "9gob2wndwaqs5sd6fd8y")


ZAI_API_KEY = os.getenv("ZAI_API_KEY")
ZAI_BASE_URL = os.getenv("ZAI_BASE_URL")
ZAI_MODEL_NAME = os.getenv("ZAI_MODEL_NAME", "GLM-4.5-air")


CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
