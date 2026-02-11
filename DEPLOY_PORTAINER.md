# Deploy na VPS (Hostinger + Portainer em Swarm)

## 1) O que mudou
O Portainer em modo Swarm nao aceita `build`, `restart` e `container_name` na stack.
Por isso, a stack agora usa imagens prontas no GHCR:
- `ghcr.io/<usuario>/orquestrador-backend`
- `ghcr.io/<usuario>/orquestrador-frontend`

## 2) Publicar imagens automaticamente (GitHub Actions)
1. No GitHub, abra o repositório.
2. Va em `Actions` e rode o workflow `Publish Docker Images` (ou faca push na `main`).
3. Aguarde concluir com sucesso.

Isso gera as imagens no GHCR com tags:
- `latest`
- `<sha-do-commit>`

## 3) Configurar stack no Portainer
1. Portainer -> `Stacks` -> `Add stack`.
2. Nome: `orquestrador`.
3. Build method: `Repository`.
4. Informe:
   - URL do repo
   - branch: `main`
   - compose path: `docker-compose.portainer.yml`
5. Em `Environment variables`, adicione:
   - `GHCR_OWNER=<seu_usuario_github_em_minusculo>`
   - `IMAGE_TAG=latest`
6. Clique `Deploy the stack`.

## 4) Se der erro de permissao no GHCR
Se as imagens estiverem privadas, faca um destes:
- tornar os packages GHCR publicos, ou
- configurar Registry no Portainer com token do GitHub (PAT com `read:packages`).

## 5) Acesso ao sistema
- URL: `http://IP_DA_VPS:8080`
- Login atual:
  - usuario: `holand`
  - senha: `Holand2026!@#`

## 6) Persistencia dos dados
- O banco SQLite fica no volume `orquestrador_data`.
- Arquivo dentro do volume: `app.db`.
- Reiniciar stack nao apaga dados.

## 7) Backup manual
```bash
mkdir -p /root/backups-orquestrador
docker run --rm \
  -v orquestrador_data:/from \
  -v /root/backups-orquestrador:/to \
  alpine sh -c "cp /from/app.db /to/app-$(date +%F-%H%M).db"
```

## 8) Atualizar versao
1. Push no GitHub.
2. Aguarde o workflow publicar novas imagens.
3. No Portainer, `Pull and redeploy` da stack.
