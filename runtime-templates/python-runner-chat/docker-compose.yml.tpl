services:
  python-runner-chat:
    build:
      context: .
      dockerfile: Dockerfile
    image: {{IMAGE_REF}}
    container_name: {{CONTAINER_NAME}}
    restart: unless-stopped
    user: "65532:65532"
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    pids_limit: {{PIDS_LIMIT}}
    mem_limit: {{MEMORY_LIMIT}}
    cpus: {{CPU_LIMIT}}
    env_file:
      - .env
    working_dir: /workspace
    command: ["sh", "-lc", "/opt/omnyid-venv/bin/python /workspace/runner_chat.py 2>&1 | tee -a /workspace/logs/runtime.log"]
    volumes:
      - ./workspace:/workspace
      - ./logs:/workspace/logs
    tmpfs:
      - /tmp:rw,size=256m,mode=1777
    ports:
      - "{{CHAT_PORT}}:{{CHAT_PORT}}"
    networks:
      - omnyid_runtime

networks:
  omnyid_runtime:
    driver: bridge
