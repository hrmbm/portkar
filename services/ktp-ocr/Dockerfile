FROM python:3.12.4-slim-bookworm

ARG OCR_COMMIT=7e0592d94491e7091d29877f9e33427708866b01
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      git tesseract-ocr tesseract-ocr-ind ffmpeg libsm6 libxext6 \
      build-essential libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/arakattack/ocr-ktp.git /opt/ocr-ktp \
    && git -C /opt/ocr-ktp checkout ${OCR_COMMIT}

WORKDIR /opt/ocr-ktp
RUN python -m pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

RUN useradd --system --create-home --uid 10001 ocruser \
    && chown -R ocruser:ocruser /opt/ocr-ktp
USER ocruser

EXPOSE 8000
CMD ["gunicorn","app:app","--workers","1","--worker-class","gthread","--threads","4","--timeout","45","--bind","0.0.0.0:8000","--access-logfile","-","--error-logfile","-"]
