start-infra:
	docker-compose up -d

start-go:
	cd backend-core && go run main.go

start-ai:
	cd ai-agents && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt && python main.py

start-frontend:
	cd frontend && npm run dev
