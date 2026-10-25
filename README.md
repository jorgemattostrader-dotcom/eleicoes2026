# Chapecó Mil Grau · Central Eleições 2026

## Mapa-múndi da votação no exterior

**[mundo.html](./mundo.html)**: terceira aba com mapa mundial de calor para o voto presidencial de brasileiros residentes no exterior.

- O mapa cobre **somente países com pelo menos uma seção eleitoral ativa identificada na configuração EA16 do TSE**, cruzada com as localidades oficiais EA12 e uma tabela de correspondência entre código eleitoral da cidade e país (134 países/186 localidades cadastrados). Países sem seção ficam neutros, inclusive locais dispensados pelo TRE-DF.
- Se o cadastro de seções do segundo turno estiver indisponível, pode usar o cadastro de seções do primeiro turno **como referência, com aviso expresso**; se nenhum cadastro for verificável, não colore países.
- Apenas resultados oficiais TSE. Consulta os resultados municipais de ZZ para compor os totais por país e consulta o agregado ZZ para os cards de exterior. Os resultados dos países podem ser **parciais** se algumas cidades ainda não receberam votos ou falharam.
- Vermelho: maior percentual de Lula entre os dois; verde: maior percentual de Flávio Bolsonaro; tons mais fortes indicam maior vantagem em pontos percentuais. Sem dados apurados = neutro.
- Filtro de país, zoom animado, modo OBS, tour e atualização periódica. Territórios menores sem polígonos no GeoJSON recebem marcadores pontuais se tiverem seções ativas.
- Malha mundial: [johan/world.geo.json](https://github.com/johan/world.geo.json), Natural Earth; [ISO-3166](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes); mapeamento 2026 de códigos de localidades em [tcdanilo/apuracao-2026](https://github.com/tcdanilo/apuracao-2026). A interface cruza os códigos com o cadastro do TSE em tempo de execução.
- URL prevista para GitHub Pages: `https://jorgemattostrader-dotcom.github.io/eleicoes2026/mundo.html`. Necessário habilitar Pages; funcionalidade de leitura TSE depende de acesso e CORS no navegador.

---

Painel interativo com resultados oficiais do Tribunal Superior Eleitoral (TSE).

## Páginas do projeto

- **[Mapa presidencial detalhado](./mapa.html)**: mapa de calor nacional, filtros de estado, cidade, zona, seção e zoom municipal.
- **[2º turno Governador](./governador.html)**: página separada com as 6 UFs que disputam o segundo turno, resultados por cidade, zona e consulta de seção.
- [Painel original](./index.html): interface original CMG de resultados por cargo.
- [Mapa V1 preservado](./mapa-v1.html): versão anterior do mapa presidencial.

## Governador · 25 de outubro de 2026

Segundo turno de governador nas 6 UFs confirmadas pelo TSE: **Acre (AC), Amazonas (AM), Distrito Federal (DF), Espírito Santo (ES), Rio Grande do Norte (RN) e Tocantins (TO)**. Não inclua RJ nesta lista: o 2º turno estadual não acontecerá lá em 25/10.

- Dados oficiais TSE: https://resultados.tse.jus.br/oficial/ele2026/6260/dados/ac/ac-c0003-e006260-u.json (exemplo AC).
- O nome dos candidatos e percentuais são extraídos do JSON oficial por UF/cidade/zona, cargo 0003.
- Amarelo identifica o candidato de menor número na urna e azul o de maior número na urna, independentemente de partido. A opacidade reflete a vantagem em pontos percentuais.
- As outras 21 UFs aparecem escurecidas e ficam fora da pesquisa do segundo turno de governador.
- Estados e municípios sem dados apurados ficam neutros. **Nenhum voto simulado**.
- A consulta por urna/seção valida seu cadastro no EA16; **não mostra votos por seção**. Para isso, é preciso ler e decodificar o Boletim de Urna (BU). Uma urna/seção não possui contorno geográfico próprio.

## Fontes e funcionamento

- Resultados: https://resultados.tse.jus.br/.
- Cadastro de municípios: EA12 do TSE (códigos TSE e IBGE); seções: EA16.
- Geografia de UFs e municípios: https://github.com/henriquemalvar/br-geojson (base do IBGE). O GeoJSON dos estados está salvo em assets/brasil-estados.geojson; as malhas municipais carregam por demanda.
- Atualização das UFs a cada 2 minutos; municípios por consulta em lote quando o estado é selecionado.
- O TSE pode ter arquivos ainda sem apuração, restrições de CORS/rede ou falhas temporárias.

## Publicação

Configure em Settings → Pages → Deploy from a branch → main / (root) no repositório. Endereços previstos após a configuração:

- https://jorgemattostrader-dotcom.github.io/eleicoes2026/mapa.html
- https://jorgemattostrader-dotcom.github.io/eleicoes2026/governador.html

Estes endereços são *previstos*, não foi confirmado se já estão acessíveis. Para teste local, sirva a pasta por HTTP e acesse governador.html.
