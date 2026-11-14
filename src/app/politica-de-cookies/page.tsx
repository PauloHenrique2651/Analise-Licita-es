import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { CookiePreferencesButton } from "@/components/legal/cookie-consent";

export const metadata: Metadata = { title: "Política de cookies" };

export default function CookiePolicyPage() {
  return (
    <LegalPage title="Política de cookies" updated="14 de novembro de 2026">
      <p>Cookies são pequenos arquivos que o navegador guarda para lembrar informações entre visitas. Esta política explica quais usamos no Nexo Público, para que servem e como você controla cada categoria, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

      <h2>O que usamos hoje</h2>
      <table>
        <thead><tr><th>Nome</th><th>Categoria</th><th>Finalidade</th><th>Duração</th></tr></thead>
        <tbody>
          <tr><td><code>sb-…-auth-token</code></td><td>Estritamente necessário</td><td>Manter você conectado e proteger a sessão (autenticação).</td><td>Sessão, renovada enquanto você usa o sistema</td></tr>
          <tr><td><code>nexo-cookie-consent</code> (armazenamento local)</td><td>Estritamente necessário</td><td>Guardar a sua escolha sobre cookies, para não perguntar de novo.</td><td>Até você alterar ou limpar o navegador</td></tr>
          <tr><td>Registro da disputa (armazenamento da sessão)</td><td>Funcional, só no seu navegador</td><td>Manter o histórico de lances do copiloto de disputa durante a sessão.</td><td>Até fechar a aba</td></tr>
        </tbody>
      </table>
      <p>Não usamos cookies de publicidade nem de rastreamento entre sites. Hoje também não usamos cookies de estatísticas.</p>

      <h2>Base legal</h2>
      <p>Os cookies estritamente necessários dispensam consentimento, pois são indispensáveis para entregar o serviço que você solicitou (art. 7º, V e IX, da LGPD). Qualquer cookie de estatísticas ou de marketing só será ativado depois de uma ação afirmativa sua, e começa sempre desligado.</p>

      <h2>Como controlar</h2>
      <ul>
        <li>Use o botão abaixo, ou o link “Preferências de cookies” no rodapé de qualquer página, para aceitar, rejeitar ou revisar categorias. Você pode mudar de ideia a qualquer momento, com a mesma facilidade com que deu o consentimento.</li>
        <li>Também é possível apagar ou bloquear cookies nas configurações do navegador. Bloquear os necessários impede o login.</li>
      </ul>
      <p><CookiePreferencesButton className="button" /></p>

      <h2>Mudanças e contato</h2>
      <p>Se passarmos a usar novas categorias, esta política será atualizada e o aviso reaparecerá para você decidir. Dúvidas ou pedidos sobre seus dados: veja a <a href="/politica-de-privacidade">Política de privacidade</a>.</p>
    </LegalPage>
  );
}
