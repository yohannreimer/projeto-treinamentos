# Deploy na VPS (Hostinger + Portainer)

## 1) Pré-requisitos
- VPS com Docker e Portainer funcionando.
- Projeto disponível em um repositório Git.
- Portas liberadas no firewall: `8080` (app) e `9443` (Portainer).

## 2) Arquivos de deploy
Este projeto já possui:
- `docker-compose.portainer.yml`
- `apps/backend/Dockerfile`
- `apps/frontend/Dockerfile`
- `apps/frontend/nginx.conf`

## 3) Criar Stack no Portainer
1. Acesse Portainer.
2. Clique em `Stacks`.
3. Clique em `Add stack`.
4. Nome: `orquestrador`.
5. Escolha `Repository` (Git) e informe:
   - URL do repositório
   - branch (ex: `main`)
   - Compose path: `docker-compose.portainer.yml`
6. Clique em `Deploy the stack`.

## 4) Acesso ao sistema
- URL: `http://IP_DA_VPS:8080`
- Login atual (hardcoded no frontend):
  - usuario: `holand`
  - senha: `Holand2026!@#`

## 5) Persistencia dos dados
- O SQLite fica no volume Docker nomeado `orquestrador_data`.
- Arquivo principal do banco: `app.db` (dentro do volume).
- Mesmo reiniciando containers, os dados continuam salvos.

## 6) Backup manual
No terminal da VPS:

```bash
mkdir -p /root/backups-orquestrador
docker run --rm \
  -v orquestrador_data:/from \
  -v /root/backups-orquestrador:/to \
  alpine sh -c "cp /from/app.db /to/app-$(date +%F-%H%M).db"
```

## 7) Atualizar versao
1. Suba alteracoes no Git.
2. No Portainer, abra a stack `orquestrador`.
3. Clique em `Pull and redeploy`.

