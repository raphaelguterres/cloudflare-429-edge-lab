# Como contar o case em um minuto

> Na VELAR, eu queria provar que o rate limiting protegia a API de leads até o banco. Defini a homologação isolada e o critério de aceite: se a borda respondesse 429, o ID daquele envio não poderia aparecer nas chamadas da API nem no SQLite.
>
> No reteste com Cloudflare Workers, dois envios fictícios foram gravados. O terceiro recebeu 429 e a base ficou com duas linhas. Depois de 12 segundos, um novo envio passou e gravou a terceira.
>
> Também investiguei um 404 de rota e um 500 do Worker. O reteste passou a esperar seis respostas de prontidão consecutivas, e a variante de diagnóstico reproduziu a exceção da configuração de redirecionamento antiga. O resultado ficou documentado com um teste que dá para repetir.

## Se pedirem mais detalhe

- **Como você localizou o bloqueio?** A resposta tinha o marcador do Worker. O mesmo ID estava na auditoria da borda e permaneceu ausente da API de leads e do SQLite.
- **Qual foi a sua contribuição?** Explique como definiu escopo e critérios, tomou decisões sobre isolamento e aceitou as evidências. Se perguntarem sobre a implementação, diga quais partes tiveram apoio de IA e como você verificou o resultado.
- **Qual é o limite do resultado?** A evidência é de homologação isolada com dados fictícios. A regra nativa do WAF e os resultados sob carga ficam fora do ensaio.
