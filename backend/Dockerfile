FROM python:3.12-slim

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends libpq-dev gcc curl nodejs npm && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN cd airtable && npm ci --omit=dev

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
