# Rate limiting na borda com prova no SQLite

Um `POST /api/lead` recebeu `429` no Cloudflare Worker. O ID apareceu na auditoria do Worker, ficou ausente do registro de chamadas à API e o SQLite permaneceu com **duas linhas**. Após 12 segundos, um novo envio retornou `201` e gravou a terceira.

Este case de AppSec e DevSecOps documenta um reteste de homologação realizado na VELAR em 24/11/2026 com um Worker em `workers.dev`, uma API de teste isolada e dados fictícios. O repositório contém as evidências sanitizadas e uma demonstração local independente.

## O que o reteste verificou

| Etapa | Resposta | Chamadas ao POST da API | Linhas no SQLite |
| --- | --- | ---: | ---: |
| Dois envios aceitos | Dois `201` da API | 2 | 2 |
| Envio `lead-3` bloqueado | `429 worker_rate_limited` na borda | 2 | 2 |
| Novo envio após 12 segundos | `201` da API | 3 | 3 |

O primeiro ensaio também revelou `404/1042` na rota temporária e um `500/1101`. A versão final aguardou seis respostas de prontidão consecutivas em conexões novas. Uma variante de diagnóstico reproduziu a exceção causada por `redirect: "error"`; a correção usou `redirect: "manual"` e rejeição explícita de redirecionamentos.

## Como rodar a demonstração

Use **Node.js 24 ou superior**. O script abre duas portas efêmeras em loopback e usa um banco SQLite descartável. O limitador local é determinístico e o relógio avança dentro do teste. O ensaio histórico usou o contador distribuído do Cloudflare e uma espera real.

```sh
node demo/retest.mjs
```

O executor verifica que o bloqueio deixa os registros da API e o SQLite iguais, que outros métodos e rotas ficam fora do limite e que um novo envio volta a gravar ao fim da janela. Também verifica `PRAGMA integrity_check` e limpa os recursos de teste.

- [Evidências e diagnóstico do reteste real](docs/evidencias.md)
- [Versão de um minuto para entrevista](docs/entrevista.md)
