FROM python:3.10-slim

# Flush prints immediately so `docker logs` shows AI activity in real time
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install --retries 10 --timeout 120 -r requirements.txt

COPY . .

# Run the sidecar script
CMD ["python", "main.py"]
