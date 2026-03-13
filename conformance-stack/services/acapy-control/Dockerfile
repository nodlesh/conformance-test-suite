FROM python:3.13-slim

# Base tooling and Hyperledger Indy repo
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     apt-transport-https \
     ca-certificates \
     curl \
     gnupg \
  && curl -fsSL https://hyperledger.jfrog.io/artifactory/api/gpg/key/public \
     | gpg --dearmor -o /usr/share/keyrings/hyperledger-archive-keyring.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/hyperledger-archive-keyring.gpg] https://hyperledger.jfrog.io/artifactory/indy focal stable" \
     > /etc/apt/sources.list.d/hyperledger-indy.list \
  && rm -rf /var/lib/apt/lists/*

# Runtime deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     build-essential \
     libffi-dev \
     libsodium23 \
     libpq5 \
     git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
COPY vendor/ /app/vendor/
RUN pip install --no-cache-dir -r requirements.txt \
  && pip install --no-cache-dir "acapy-agent[indy,askar]==1.4.0" \
  && pip install --no-cache-dir \
     "didcomm-messaging==0.1.1a0" \
     anoncreds \
     indy-credx \
     indy_vdr

COPY . .

ENV PYTHONPATH=/app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9001"]
