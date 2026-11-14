# Segurança do módulo fiscal

Emissão fiscal real permanece bloqueada até homologação. O NFeWizard.io é uma base técnica para o worker, não um serviço pronto para produção no frontend.

Regras obrigatórias:

- aceitar somente certificado A1 no escopo inicial;
- upload direto para cofre externo, nunca para o bundle web;
- não persistir PFX ou senha no Supabase;
- guardar apenas referência opaca, fingerprint, CNPJ e expiração;
- exigir autorização documentada quando o certificado pertencer ao cliente;
- separar homologação e produção;
- validar XML/schema e dados tributários antes de assinar;
- assinar e transmitir em worker isolado, com fila idempotente;
- armazenar XML autorizado e DANFE em bucket privado;
- aplicar retenção, revogação, rotação e auditoria;
- não registrar senha, certificado, XML integral ou dados pessoais em logs;
- realizar revisão jurídica/LGPD, contábil e fiscal antes de cobrar por emissão.

O repositório NFeWizard.io informa suporte a A1 e maior histórico de testes em São Paulo. Expansão por UF deve passar por homologação individual e contingência SEFAZ.
