FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

COPY . .

# Run the sidecar script
CMD ["python", "main.py"]
