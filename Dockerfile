FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 HOME=/app XDG_CACHE_HOME=/app/.cache
# ffmpeg: required by both workers (pydub/mutagen duration fixes, whisper transcription)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
# torch from the CPU index FIRST (default pip torch drags in ~5GB of CUDA libs;
# host venv runs 2.9.1+cpu), then the rest (whisper sees torch already present).
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt
COPY . .
# gunicorn >=26 wants a writable control-socket dir at $HOME/.gunicorn
RUN mkdir -p /app/.gunicorn && chown 1000:1000 /app/.gunicorn
EXPOSE 5000
CMD python manage.py collectstatic --noinput && \
    exec gunicorn listener_library.wsgi:application --bind 127.0.0.1:5000 --workers 3 --timeout 300 \
      --access-logfile - --error-logfile -
