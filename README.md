# Chapecó Mil Grau · Central Eleições 2026

Painel de acompanhamento dos resultados oficiais do Tribunal Superior Eleitoral (TSE).

## Páginas do projeto

- [Painel original](./index.html): cargos e municípios, layout CMG.
- **[Mapa Eleitoral V1](./mapa.html)**: Brasil inteiro com as 27 unidades da federação e mapa interativo animado.

## Mapa V1

- Apuração presidencial do **2º turno (25/10/2026)** e comparação com o **1º turno (04/10/2026)**.
- Cores solicitadas para comparação: vermelho = Lula (13), verde = Flávio Bolsonaro (22).
- A opacidade é proporcional à **vantagem em pontos percentuais**, não a eleitores por área.
- Estados sem dados oficiais apurados continuam neutros. **Não há resultados simulados**.
- Clique/hover no estado, visão nacional, ranking das UFs, tour automático e modo OBS.
- Dados oficiais EA20 do TSE: arquivo Brasil e 27 arquivos das UFs, atualizados a cada 60 segundos.
- Mapas geográficos: [br-geojson](https://github.com/henriquemalvar/br-geojson), malha IBGE / licença CC0, copiada para `assets/brasil-estados.geojson`.
- Funciona como site estático (GitHub Pages ou outro host HTTPS).

## Como abrir

Quando o GitHub Pages estiver configurado para publicar a pasta raiz de `main`, acessar:

`https://jorgemattostrader-dotcom.github.io/eleicoes2026/mapa.html`

Esse é um **endereço previsto**, não uma confirmação de publicação. Alternativamente, sirva a pasta local por um servidor HTTP, como `python3 -m http.server 8000`, e acesse `http://localhost:8000/mapa.html`. O `fetch` do arquivo GeoJSON local requer um servidor HTTP; não abra com `file://`.

## Fonte e limitações

A fonte de resultados é `https://resultados.tse.jus.br/oficial/ele2026/{eleicao}/dados/{uf}/{uf}-c0001-e{eleicao6}-u.json`, eleições `6257` (1º turno) e `6258` (2º turno). O arquivo Brasil inclui votação no exterior.

O painel consulta os arquivos diretamente pelo navegador. Restrições temporárias de acesso, CORS, conexão ou dados ainda não totalizados podem impedir resultados em alguma UF. Cada UF é uma fotografia do horário de geração indicado no TSE, que pode variar entre UFs. O projeto não prevê nenhum resultado eleitoral e não substitui a fonte oficial.

## Próximas versões

V2: detalhamento municipal ao selecionar uma UF. V3: pesquisa por município, filtros avançados e tratamento operacional de falhas/retries.
