FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV VIRTUAL_ENV=/opt/omnyid-venv
ENV PATH="/opt/omnyid-venv/bin:${PATH}"

RUN python -m venv ${VIRTUAL_ENV}

WORKDIR /workspace

COPY requirements.txt /tmp/requirements.txt
RUN ${VIRTUAL_ENV}/bin/python -m pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm -f /tmp/requirements.txt
