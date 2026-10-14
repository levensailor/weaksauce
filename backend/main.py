import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers.tools import router as tools_router
from backend.utils.logger import get_logger

load_dotenv()

logger = get_logger()

SERVICE_NAME = os.getenv("WEAKSAUCE_SERVICE_NAME", "weaksauce-fastapi-dsp")
SERVICE_VERSION = os.getenv("WEAKSAUCE_VERSION", "1.0.0")

app = FastAPI(
    title=SERVICE_NAME,
    version=SERVICE_VERSION,
    description="WEAKSAUCE // 3-Piece Home Recording Rock Band & Engineer/Singer DSP Backend",
)

allowed_origins = os.getenv("WEAKSAUCE_CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

app.include_router(tools_router)
logger.info("Initialized %s v%s", SERVICE_NAME, SERVICE_VERSION)
