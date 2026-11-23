services:
  crewai-runtime:
    image: {{IMAGE_REF}}
    container_name: {{CONTAINER_NAME}}
    restart: unless-stopped
    env_file:
      - .env
    working_dir: /workspace
    command: ["sh", "-lc", "python crew_runtime.py 2>&1 | tee -a /runtime-logs/runtime.log"]
    volumes:
      - ./workspace:/workspace
      - ./logs:/runtime-logs
    networks:
      - omnyid_runtime

networks:
  omnyid_runtime:
    driver: bridge
