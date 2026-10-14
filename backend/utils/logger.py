import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv()

LOG_TIMEZONE_NAME = os.getenv("WEAKSAUCE_LOG_TZ", "America/New_York")
LOG_FILE_PATH = os.getenv(
    "WEAKSAUCE_LOG_FILE",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs", "weaksauce.log"),
)
LOG_MAX_BYTES = int(os.getenv("WEAKSAUCE_LOG_MAX_BYTES", str(1_048_576)))
LOG_BACKUP_COUNT = int(os.getenv("WEAKSAUCE_LOG_BACKUP_COUNT", "3"))
LOGGER_NAME = os.getenv("WEAKSAUCE_LOGGER_NAME", "weaksauce.backend")


class LocalizedEstFormatter(logging.Formatter):
    """Formats log records with a localized America/New_York (EST/EDT) timestamp, function name, and line number."""

    def __init__(self, fmt: str) -> None:
        super().__init__(fmt=fmt)
        self._tz = ZoneInfo(LOG_TIMEZONE_NAME)

    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        localized_dt = datetime.fromtimestamp(record.created, tz=self._tz)
        if datefmt:
            return localized_dt.strftime(datefmt)
        return localized_dt.strftime("%Y-%m-%d %H:%M:%S %Z")


def get_logger(name: str | None = None) -> logging.Logger:
    target_name = name or LOGGER_NAME
    logger = logging.getLogger(target_name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    log_format = (
        "%(asctime)s [%(levelname)s] %(name)s:%(funcName)s:%(lineno)d - %(message)s"
    )
    formatter = LocalizedEstFormatter(log_format)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    for candidate_path in (LOG_FILE_PATH, os.path.join("/tmp", "weaksauce.log")):
        try:
            log_dir = os.path.dirname(candidate_path)
            if log_dir:
                os.makedirs(log_dir, exist_ok=True)
            file_handler = RotatingFileHandler(
                candidate_path,
                maxBytes=LOG_MAX_BYTES,
                backupCount=LOG_BACKUP_COUNT,
                encoding="utf-8",
            )
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            break
        except OSError:
            continue

    logger.propagate = False
    return logger
