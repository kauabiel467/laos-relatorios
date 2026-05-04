# Laos — Sistema de Relatórios

Sistema interno da Laos Assessoria para geração de relatórios mensais de clientes com análise automática por IA.

---

## ✅ Passo a passo de instalação

### 1. Criar projeto no Supabase (banco de dados)

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita
2. Clique em **New Project** → dê um nome (ex: `laos-relatorios`)
3. Aguarde o projeto inicializar (~1 minuto)
4. No menu lateral, clique em **SQL Editor**
5. Cole e execute o conteúdo do arquivo `supabase/schema.sql`
6. Vá em **Settings → API** e copie:
   - `Project URL` → será o `REACT_APP_SUPABASE_URL`
   - `anon public key` → será o `REACT_APP_SUPABASE_ANON_KEY`

---

### 2. Subir o código no GitHub

1. Crie um repositório novo no [github.com](https://github.com) (pode ser privado)
2. Na pasta do projeto, execute:

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/laos-relatorios.git
git push -u origin main
```

---

### 3. Deploy no Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login com sua conta GitHub
2. Clique em **Add New → Project**
3. Selecione o repositório `laos-relatorios`
4. Na seção **Environment Variables**, adicione:

| Nome | Valor |
|------|-------|
| `REACT_APP_SUPABASE_URL` | URL do seu projeto Supabase |
| `REACT_APP_SUPABASE_ANON_KEY` | Chave anon do Supabase |

5. Clique em **Deploy**
6. Aguarde ~2 minutos → seu sistema estará no ar com uma URL tipo `laos-relatorios.vercel.app`

---

### 4. Compartilhar com os gestores

Envie o link gerado pelo Vercel para os outros gestores. Todos acessam pelo navegador, sem instalar nada. Os relatórios de todos ficam no mesmo painel compartilhado via Supabase.

---

## 🔄 Como atualizar o sistema

Qualquer mudança que você fizer nos arquivos e fizer `git push`, o Vercel atualiza automaticamente em ~1 minuto.

---

## 📁 Estrutura do projeto

```
laos-relatorios/
├── public/
│   └── index.html
├── src/
│   ├── App.js          ← Interface principal
│   ├── ia.js           ← Extração via IA (CSV + PDF) e análise
│   ├── supabase.js     ← Conexão com banco de dados
│   └── index.js        ← Entry point
├── supabase/
│   └── schema.sql      ← SQL para criar a tabela
├── .env.example        ← Modelo das variáveis de ambiente
├── .gitignore
└── package.json
```

---

## 💡 Como usar

1. Acesse o sistema pelo link
2. Clique em **+ Novo Relatório**
3. Preencha: cliente, gestor, mês
4. Faça upload do **CSV do Meta Ads** → IA extrai automaticamente
5. Faça upload do **print/PDF do cardápio** → IA lê e extrai os números
6. Complemente campos que a IA não encontrou
7. Clique em **Gerar Análise IA** → plano de ação personalizado
8. Revise e edite o que precisar
9. Salve → aparece no painel de todos os gestores
