import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Política de privacidade" };

const contact = process.env.NEXT_PUBLIC_PRIVACY_CONTACT?.trim() || "o canal de privacidade informado no seu contrato de uso";

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Política de privacidade" updated="14 de novembro de 2026">
      <p>Esta política descreve como o Nexo Público trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).</p>

      <h2>Quem é o controlador</h2>
      <p>O Nexo Público é o controlador dos dados de cadastro e de acesso. Para dados que a sua empresa insere no sistema (por exemplo, clientes e documentos do portal do cliente), a sua empresa é a controladora e o Nexo atua como operador. Contato do encarregado (DPO) e pedidos de titulares: {contact}.</p>

      <h2>Quais dados tratamos</h2>
      <ul>
        <li><strong>Cadastro e acesso:</strong> nome, e-mail, empresa e senha (guardada de forma protegida, nunca em texto aberto).</li>
        <li><strong>Uso do sistema:</strong> estratégias de disputa, oportunidades, alertas, checklists e documentos que você cria.</li>
        <li><strong>Dados públicos de licitações:</strong> obtidos de fontes oficiais abertas (PNCP, Compras.gov.br, Portal da Transparência, IBGE). Não são dados dos usuários.</li>
        <li><strong>Assistente de IA:</strong> o texto das perguntas que você digita é enviado ao provedor de IA para gerar a resposta. Não envie dados pessoais sensíveis nem documentos sigilosos.</li>
        <li><strong>Cookies:</strong> veja a <a href="/politica-de-cookies">Política de cookies</a>.</li>
      </ul>

      <h2>Para que usamos (finalidades e bases legais)</h2>
      <ul>
        <li>Criar e manter a sua conta e entregar o serviço contratado (execução de contrato, art. 7º, V).</li>
        <li>Segurança, prevenção a fraudes e cumprimento de obrigações legais (art. 7º, II e IX).</li>
        <li>Comunicações sobre o serviço, como confirmação de e-mail e recuperação de senha.</li>
        <li>Melhorias de produto com dados estatísticos, somente se você autorizar cookies de estatísticas.</li>
      </ul>

      <h2>Com quem compartilhamos</h2>
      <p>Apenas com operadores necessários à entrega do serviço: hospedagem e banco de dados (Vercel e Supabase), envio de e-mails e provedor de IA do assistente (Google). Não vendemos dados pessoais.</p>

      <h2>Por quanto tempo guardamos</h2>
      <p>Enquanto a conta estiver ativa e pelo prazo necessário para obrigações legais. Ao encerrar a conta, os dados são excluídos ou anonimizados, salvo guarda exigida por lei.</p>

      <h2>Seus direitos (art. 18)</h2>
      <p>Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamentos e revogação do consentimento. Escreva para {contact}. Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>

      <h2>Segurança</h2>
      <p>Usamos conexão criptografada, controle de acesso por empresa e função, e isolamento de dados entre empresas. Nenhum sistema é totalmente imune; em caso de incidente relevante, comunicaremos os afetados e a ANPD conforme a lei.</p>

      <h2>Alterações</h2>
      <p>Podemos atualizar esta política. A data de atualização fica no topo da página.</p>
    </LegalPage>
  );
}
