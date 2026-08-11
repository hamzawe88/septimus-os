FROM python:3.12.12-slim

# Flush prints immediately so `docker logs` shows AI activity in real time
ENV PYTHONUNBUFFERED=1 \
    PIP_ROOT_USER_ACTION=ignore

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --retries 10 --timeout 120 \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.13.0 \
    && pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

RUN groupadd --gid 10001 septimus && useradd --uid 10001 --gid septimus --home-dir /app --no-create-home septimus \
    && mkdir -p /models && chown septimus:septimus /models
COPY --chown=septimus:septimus . .

USER septimus

# Run the sidecar script
CMD ["python", "main.py"]
