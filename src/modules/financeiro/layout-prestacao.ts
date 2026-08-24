/**
 * O layout do modelo de prestação de contas exigido pelo órgão.
 *
 * **Arquivo gerado.** Não edite à mão: rode
 * `npx tsx scripts/extrair-layout-prestacao.ts` contra o modelo em
 * `docs/convenio/`, que fica fora do git.
 *
 * Só contém faixas de célula, larguras de coluna e rótulos fixos. Nenhuma
 * célula da faixa de dados é copiada — há teste conferindo que nenhum CPF ou
 * CNPJ escapou.
 */

export type LayoutFolha = {
  nome: string
  merges: string[]
  larguras: { coluna: number; largura: number }[]
  /** Célula → texto. Rótulo fixo, nunca dado de ninguém. */
  rotulos: Record<string, string>
  /** Onde começa e termina a faixa que cresce com o volume de lançamentos. */
  faixaDados?: { primeiraLinha: number; ultimaLinha: number }
}

export type NomeFolha =
  | '1-Capa'
  | '2-Contra-Capa'
  | '3-Despesas'
  | '4-Receitas'
  | '5-Conciliação'
  | '6-Encerramento'

export const LAYOUT: Record<NomeFolha, LayoutFolha> = {
  "1-Capa": {
    "nome": "1-Capa",
    "merges": [
      "A11:L16",
      "A1:L2",
      "A23:L28",
      "A29:L33",
      "A3:L3",
      "A47:L50",
      "A51:L55"
    ],
    "larguras": [
      {
        "coluna": 1,
        "largura": 8.140625
      },
      {
        "coluna": 2,
        "largura": 8.140625
      },
      {
        "coluna": 3,
        "largura": 8.140625
      },
      {
        "coluna": 4,
        "largura": 8.140625
      },
      {
        "coluna": 5,
        "largura": 8.140625
      },
      {
        "coluna": 6,
        "largura": 8.140625
      },
      {
        "coluna": 7,
        "largura": 8.140625
      },
      {
        "coluna": 8,
        "largura": 8.140625
      },
      {
        "coluna": 9,
        "largura": 8.140625
      },
      {
        "coluna": 10,
        "largura": 8.140625
      },
      {
        "coluna": 11,
        "largura": 8.140625
      },
      {
        "coluna": 12,
        "largura": 8.140625
      }
    ],
    "rotulos": {
      "A1": "NOME INSTITUIÇÃO",
      "A3": "CNPJ: xx.xxx.xxx/xxxx-xx - ENDEREÇO COMPLETO",
      "A11": "PRESTAÇÃO DE CONTAS",
      "A23": "JUNHO",
      "A51": "Conta Corrente nº XX.XXX-X"
    }
  },
  "2-Contra-Capa": {
    "nome": "2-Contra-Capa",
    "merges": [
      "A10:L10",
      "A12:L12",
      "A13:L13",
      "A15:L15",
      "A16:L36",
      "A1:L2",
      "A38:F38",
      "A39:F39",
      "A3:L3",
      "A40:F40",
      "A4:L4",
      "A56:L56",
      "A5:L5",
      "A6:L6",
      "A7:L7",
      "A8:L8",
      "A9:L9",
      "G38:L38",
      "G39:L39",
      "G40:L40"
    ],
    "larguras": [
      {
        "coluna": 1,
        "largura": 8.140625
      },
      {
        "coluna": 2,
        "largura": 8.140625
      },
      {
        "coluna": 3,
        "largura": 8.140625
      },
      {
        "coluna": 4,
        "largura": 8.140625
      },
      {
        "coluna": 5,
        "largura": 8.140625
      },
      {
        "coluna": 6,
        "largura": 8.140625
      },
      {
        "coluna": 7,
        "largura": 8.140625
      },
      {
        "coluna": 8,
        "largura": 8.140625
      },
      {
        "coluna": 9,
        "largura": 8.140625
      },
      {
        "coluna": 10,
        "largura": 8.140625
      },
      {
        "coluna": 11,
        "largura": 8.140625
      },
      {
        "coluna": 12,
        "largura": 8.140625
      },
      {
        "coluna": 13,
        "largura": 9.140625
      },
      {
        "coluna": 14,
        "largura": 10.140625
      }
    ],
    "rotulos": {
      "A5": "Cuiabá/MT, 04 de julho de 2026.",
      "A10": "Assunto: Prestação de Contas",
      "A16": "Prezado Senhor,\n\n             Em anexo apresentamos a Prestação de Contas referente aos repasses referente o período de  dezembro de 2025, correspondente aos gastos efetuados, pagos, utilizando os recursos recebidos para tal fim, conforme demonstrado abaixo e fotocópias anexas:\n\n              Informamos ainda, que, a Associação Lar dos Idosos, entidade filantrópica, sem fins lucrativos, políticos ou de proselitismo religioso, cujo objetivo é dar apoio aos idosos da cidade e região.\n\n              Como é uma associação sem fins lucrativos e sobrevive de realização de promoções, contribuições e doações, carece e muito de todos nós, pois a nossa contribuição e esforço, reverte-se em benefício de pessoas ali residentes.\n \n              Agradecidos e esperando ter atendido a necessidade da prestação de contas, desejamos um bom trabalho coroado de êxitos, aproveitamos para reiterar votos de estima e consideração.\n\nRespeitosamente,",
      "A38": "_______________________________________",
      "G38": "_______________________________________",
      "A39": "Nome Presidente",
      "G39": "Nome Tesoureiro",
      "A40": "Presidente",
      "G40": "Tesoureiro"
    }
  },
  "3-Despesas": {
    "nome": "3-Despesas",
    "merges": [
      "A1:L2",
      "A36:F36",
      "A37:F37",
      "A38:F38",
      "A3:L3",
      "A4:L4",
      "A5:L5",
      "A6:L6",
      "A7:L7",
      "A8:L8",
      "A9:L9",
      "B10:E10",
      "B11:E11",
      "B12:E12",
      "B13:E13",
      "B14:E14",
      "B15:E15",
      "B16:E16",
      "B17:E17",
      "B18:E18",
      "B19:E19",
      "B20:E20",
      "B21:E21",
      "B22:E22",
      "B23:E23",
      "B24:E24",
      "B25:E25",
      "B26:E26",
      "B27:E27",
      "B28:E28",
      "B29:E29",
      "B30:E30",
      "B31:E31",
      "B32:E32",
      "B33:G33",
      "F10:G10",
      "F11:G11",
      "F12:G12",
      "F13:G13",
      "F14:G14",
      "F15:G15",
      "F16:G16",
      "F17:G17",
      "F18:G18",
      "F19:G19",
      "F20:G20",
      "F21:G21",
      "F22:G22",
      "F23:G23",
      "F24:G24",
      "F25:G25",
      "F26:G26",
      "F27:G27",
      "F28:G28",
      "F29:G29",
      "F30:G30",
      "F31:G31",
      "F32:G32",
      "G36:L36",
      "G37:L37",
      "G38:L38",
      "H33:I33",
      "I10:J10",
      "I11:J11",
      "I12:J12",
      "I13:J13",
      "I14:J14",
      "I15:J15",
      "I16:J16",
      "I17:J17",
      "I18:J18",
      "I19:J19",
      "I20:J20",
      "I21:J21",
      "I22:J22",
      "I23:J23",
      "I24:J24",
      "I25:J25",
      "I26:J26",
      "I27:J27",
      "I28:J28",
      "I29:J29",
      "I30:J30",
      "I31:J31",
      "I32:J32",
      "J33:L33",
      "K10:L10",
      "K11:L11",
      "K12:L12",
      "K13:L13",
      "K14:L14",
      "K15:L15",
      "K16:L16",
      "K17:L17",
      "K18:L18",
      "K19:L19",
      "K20:L20",
      "K21:L21",
      "K22:L22",
      "K23:L23",
      "K24:L24",
      "K25:L25",
      "K26:L26",
      "K27:L27",
      "K28:L28",
      "K29:L29",
      "K30:L30",
      "K31:L31",
      "K32:L32"
    ],
    "larguras": [
      {
        "coluna": 1,
        "largura": 8.140625
      },
      {
        "coluna": 2,
        "largura": 8.140625
      },
      {
        "coluna": 3,
        "largura": 8.140625
      },
      {
        "coluna": 4,
        "largura": 8.140625
      },
      {
        "coluna": 5,
        "largura": 8.140625
      },
      {
        "coluna": 6,
        "largura": 8.140625
      },
      {
        "coluna": 7,
        "largura": 8.140625
      },
      {
        "coluna": 8,
        "largura": 8.140625
      },
      {
        "coluna": 9,
        "largura": 8.140625
      },
      {
        "coluna": 10,
        "largura": 8.140625
      },
      {
        "coluna": 11,
        "largura": 8.140625
      },
      {
        "coluna": 12,
        "largura": 8.140625
      },
      {
        "coluna": 13,
        "largura": 9.140625
      },
      {
        "coluna": 14,
        "largura": 9.140625
      },
      {
        "coluna": 15,
        "largura": 9.140625
      },
      {
        "coluna": 16,
        "largura": 9.140625
      },
      {
        "coluna": 17,
        "largura": 9.140625
      },
      {
        "coluna": 18,
        "largura": 9.140625
      },
      {
        "coluna": 19,
        "largura": 9.140625
      },
      {
        "coluna": 20,
        "largura": 9.140625
      }
    ],
    "rotulos": {
      "A1": "Prefeitura Municipal de (Cidade/Sigla Estado)",
      "A5": "Unidade Executora:",
      "A6": "NOME INSTITUIÇÃO",
      "A8": "DESPESAS",
      "A10": "Item",
      "B10": "Credor",
      "F10": "CNPJ/CPF",
      "H10": "CH/OB",
      "I10": "Data",
      "K10": "Valor (R$)",
      "H33": "Total",
      "A34": "Unidade Executora:",
      "A36": "_______________________________________",
      "G36": "_______________________________________",
      "A37": "Nome Presidente",
      "G37": "Nome Tesoureiro",
      "A38": "Presidente",
      "G38": "Tesoureiro"
    },
    "faixaDados": {
      "primeiraLinha": 11,
      "ultimaLinha": 32
    }
  },
  "4-Receitas": {
    "nome": "4-Receitas",
    "merges": [
      "A1:L2",
      "A36:F36",
      "A37:F37",
      "A38:F38",
      "A3:L3",
      "A4:L4",
      "A5:L5",
      "A6:L6",
      "A7:L7",
      "A8:L8",
      "A9:L9",
      "B10:E10",
      "B11:E11",
      "B12:E12",
      "B13:E13",
      "B14:E14",
      "B15:E15",
      "B16:E16",
      "B17:E17",
      "B18:E18",
      "B19:E19",
      "B20:E20",
      "B21:E21",
      "B22:E22",
      "B23:E23",
      "B24:E24",
      "B25:E25",
      "B26:E26",
      "B27:E27",
      "B28:E28",
      "B29:E29",
      "B30:E30",
      "B31:E31",
      "B32:E32",
      "B33:G33",
      "F10:H10",
      "F11:H11",
      "F12:H12",
      "F13:H13",
      "F14:H14",
      "F15:H15",
      "F16:H16",
      "F17:H17",
      "F18:H18",
      "F19:H19",
      "F20:H20",
      "F21:H21",
      "F22:H22",
      "F23:H23",
      "F24:H24",
      "F25:H25",
      "F26:H26",
      "F27:H27",
      "F28:H28",
      "F29:H29",
      "F30:H30",
      "F31:H31",
      "F32:H32",
      "G36:L36",
      "G37:L37",
      "G38:L38",
      "H33:I33",
      "I10:J10",
      "I11:J11",
      "I12:J12",
      "I13:J13",
      "I14:J14",
      "I15:J15",
      "I16:J16",
      "I17:J17",
      "I18:J18",
      "I19:J19",
      "I20:J20",
      "I21:J21",
      "I22:J22",
      "I23:J23",
      "I24:J24",
      "I25:J25",
      "I26:J26",
      "I27:J27",
      "I28:J28",
      "I29:J29",
      "I30:J30",
      "I31:J31",
      "I32:J32",
      "J33:L33",
      "K10:L10",
      "K11:L11",
      "K12:L12",
      "K13:L13",
      "K14:L14",
      "K15:L15",
      "K16:L16",
      "K17:L17",
      "K18:L18",
      "K19:L19",
      "K20:L20",
      "K21:L21",
      "K22:L22",
      "K23:L23",
      "K24:L24",
      "K25:L25",
      "K26:L26",
      "K27:L27",
      "K28:L28",
      "K29:L29",
      "K30:L30",
      "K31:L31",
      "K32:L32"
    ],
    "larguras": [
      {
        "coluna": 1,
        "largura": 8.140625
      },
      {
        "coluna": 2,
        "largura": 8.140625
      },
      {
        "coluna": 3,
        "largura": 8.140625
      },
      {
        "coluna": 4,
        "largura": 8.140625
      },
      {
        "coluna": 5,
        "largura": 8.140625
      },
      {
        "coluna": 6,
        "largura": 8.140625
      },
      {
        "coluna": 7,
        "largura": 8.140625
      },
      {
        "coluna": 8,
        "largura": 8.140625
      },
      {
        "coluna": 9,
        "largura": 8.140625
      },
      {
        "coluna": 10,
        "largura": 8.140625
      },
      {
        "coluna": 11,
        "largura": 8.140625
      },
      {
        "coluna": 12,
        "largura": 8.140625
      },
      {
        "coluna": 13,
        "largura": 9.140625
      },
      {
        "coluna": 14,
        "largura": 9.140625
      },
      {
        "coluna": 15,
        "largura": 9.140625
      },
      {
        "coluna": 16,
        "largura": 9.140625
      },
      {
        "coluna": 17,
        "largura": 9.140625
      },
      {
        "coluna": 18,
        "largura": 9.140625
      },
      {
        "coluna": 19,
        "largura": 9.140625
      },
      {
        "coluna": 20,
        "largura": 9.140625
      }
    ],
    "rotulos": {
      "A1": "Prefeitura Municipal de (Cidade/Sigla Estado)",
      "A5": "Unidade Executora:",
      "A8": "RECEBIMENTOS",
      "A10": "Item",
      "B10": "Credor",
      "F10": "CNPJ/CPF",
      "I10": "Data",
      "K10": "Valor (R$)",
      "H33": "Total",
      "A34": "Unidade Executora:",
      "A36": "_______________________________________",
      "G36": "_______________________________________",
      "A37": "Nome Presidente",
      "G37": "Nome Tesoureiro",
      "A38": "Presidente",
      "G38": "Tesoureiro"
    },
    "faixaDados": {
      "primeiraLinha": 11,
      "ultimaLinha": 32
    }
  },
  "5-Conciliação": {
    "nome": "5-Conciliação",
    "merges": [
      "A10:D10",
      "A11:L11",
      "A12:I12",
      "A13:I13",
      "A14:I14",
      "A19:I19",
      "A1:L2",
      "A20:I20",
      "A21:I21",
      "A22:I22",
      "A3:L3",
      "A47:I47",
      "A49:I49",
      "A4:L4",
      "A54:F54",
      "A55:F55",
      "A56:F56",
      "A5:L5",
      "A6:L6",
      "A7:L7",
      "A8:L8",
      "A9:D9",
      "B15:F15",
      "B16:F16",
      "B17:F17",
      "B18:F18",
      "B23:E23",
      "B24:E24",
      "B25:E25",
      "B26:E26",
      "B27:E27",
      "B28:E28",
      "B29:E29",
      "B30:E30",
      "B31:E31",
      "B32:E32",
      "B33:E33",
      "B34:E34",
      "B35:E35",
      "B36:E36",
      "B37:E37",
      "B38:E38",
      "B39:E39",
      "B40:E40",
      "B41:E41",
      "B42:E42",
      "B43:E43",
      "B44:E44",
      "B45:E45",
      "B46:E46",
      "E10:H10",
      "E9:H9",
      "F23:I23",
      "F24:I24",
      "F25:I25",
      "F26:I26",
      "F27:I27",
      "F28:I28",
      "F29:I29",
      "F30:I30",
      "F31:I31",
      "F32:I32",
      "F33:I33",
      "F34:I34",
      "F35:I35",
      "F36:I36",
      "F37:I37",
      "F38:I38",
      "F39:I39",
      "F40:I40",
      "F41:I41",
      "F42:I42",
      "F43:I43",
      "F44:I44",
      "F45:I45",
      "F46:I46",
      "G54:L54",
      "G55:L55",
      "G56:L56",
      "I10:L10",
      "I9:L9",
      "J12:L12",
      "J13:L13",
      "J14:L14",
      "J15:L15",
      "J16:L16",
      "J17:L17",
      "J18:L18",
      "J19:L19",
      "J20:L20",
      "J21:L21",
      "J22:L22",
      "J24:L24",
      "J25:L25",
      "J26:L26",
      "J27:L27",
      "J28:L28",
      "J29:L29",
      "J30:L30",
      "J31:L31",
      "J32:L32",
      "J33:L33",
      "J34:L34",
      "J35:L35",
      "J36:L36",
      "J37:L37",
      "J38:L38",
      "J39:L39",
      "J40:L40",
      "J41:L41",
      "J42:L42",
      "J43:L43",
      "J44:L44",
      "J45:L45",
      "J46:L46",
      "J47:L47",
      "J49:L49"
    ],
    "larguras": [
      {
        "coluna": 1,
        "largura": 8.140625
      },
      {
        "coluna": 2,
        "largura": 8.140625
      },
      {
        "coluna": 3,
        "largura": 8.140625
      },
      {
        "coluna": 4,
        "largura": 8.140625
      },
      {
        "coluna": 5,
        "largura": 8.140625
      },
      {
        "coluna": 6,
        "largura": 8.140625
      },
      {
        "coluna": 7,
        "largura": 8.140625
      },
      {
        "coluna": 8,
        "largura": 8.140625
      },
      {
        "coluna": 9,
        "largura": 8.140625
      },
      {
        "coluna": 10,
        "largura": 8.140625
      },
      {
        "coluna": 11,
        "largura": 8.140625
      },
      {
        "coluna": 12,
        "largura": 8.140625
      },
      {
        "coluna": 13,
        "largura": 9.140625
      },
      {
        "coluna": 14,
        "largura": 10.140625
      },
      {
        "coluna": 15,
        "largura": 9.140625
      },
      {
        "coluna": 16,
        "largura": 9.140625
      },
      {
        "coluna": 17,
        "largura": 9.140625
      }
    ],
    "rotulos": {
      "A5": "CONCILIAÇÃO BANCÁRIA",
      "A7": "Período de 01/06/2026 a 30/06/2026",
      "A8": "Dados Bancários",
      "A9": "Banco",
      "E9": "Agência",
      "I9": "Conta Corrente nº",
      "A10": "Nome Banco",
      "E10": "XXX",
      "I10": "XX.XXX-X",
      "A11": "Movimentação Bancária",
      "A12": "Discriminação",
      "J12": "Saldo",
      "A13": "Saldo Anterior",
      "A14": "(+) Recebimentos",
      "B15": "Doações",
      "A20": "Total de Saldo + Receitas",
      "A22": "( - ) Despesas",
      "F23": "Categoria",
      "F24": "Salário",
      "F25": "Salário",
      "F26": "Salário",
      "F27": "Salário",
      "F28": "Salário",
      "F29": "Salário",
      "F30": "Diária",
      "F31": "Peça para conserto",
      "F32": "Prestação de Serviços de terceiros",
      "F33": "Taxa bancária",
      "F34": "Serviço reforma cozinha",
      "F35": "Taxa bancária",
      "F36": "Energia",
      "F37": "Água e Esgoto",
      "F38": "Compra de móveis",
      "F39": "Diária",
      "F40": "Taxa bancária",
      "F41": "Prestação de Serviços de terceiros",
      "A47": "Total de Despesas",
      "A49": "Saldo Disponível",
      "A51": "Unidade Executora:",
      "A54": "_______________________________________",
      "G54": "_______________________________________",
      "A55": "Nome",
      "G55": "Nome",
      "A56": "Tesoureiro",
      "G56": "Presidente"
    }
  },
  "6-Encerramento": {
    "nome": "6-Encerramento",
    "merges": [
      "A10:L10",
      "A11:L21",
      "A1:L2",
      "A23:L23",
      "A24:L24",
      "A28:F28",
      "A29:F29",
      "A30:F30",
      "A32:L32",
      "A36:L36",
      "A37:L37",
      "A38:L38",
      "A3:L3",
      "A5:L5",
      "A6:L6",
      "A7:L7",
      "A8:L8",
      "A9:L9",
      "G28:L28",
      "G29:L29",
      "G30:L30"
    ],
    "larguras": [
      {
        "coluna": 1,
        "largura": 8.140625
      },
      {
        "coluna": 2,
        "largura": 8.140625
      },
      {
        "coluna": 3,
        "largura": 8.140625
      },
      {
        "coluna": 4,
        "largura": 8.140625
      },
      {
        "coluna": 5,
        "largura": 8.140625
      },
      {
        "coluna": 6,
        "largura": 8.140625
      },
      {
        "coluna": 7,
        "largura": 8.140625
      },
      {
        "coluna": 8,
        "largura": 8.140625
      },
      {
        "coluna": 9,
        "largura": 8.140625
      },
      {
        "coluna": 10,
        "largura": 8.140625
      },
      {
        "coluna": 11,
        "largura": 8.140625
      },
      {
        "coluna": 12,
        "largura": 8.140625
      },
      {
        "coluna": 13,
        "largura": 9.140625
      },
      {
        "coluna": 14,
        "largura": 10.140625
      },
      {
        "coluna": 15,
        "largura": 9.140625
      },
      {
        "coluna": 16,
        "largura": 9.140625
      },
      {
        "coluna": 17,
        "largura": 9.140625
      },
      {
        "coluna": 18,
        "largura": 9.140625
      }
    ],
    "rotulos": {
      "A5": "DECLARAÇÃO DE GUARDA E CONSERVAÇÃO DOS DOCUMENTOS CONTÁBEIS",
      "A7": "Unidade Executora:",
      "A11": "Instrução para Claude, aqui deve caber também anotações importante que devem ser citadas na Prestação de Contas, como justificativa de valores utilizados ou qualquer outro assunto.\n\n           Declaramos para os devidos fins de direito que os Documentos Contábeis referentes à Prestação de Contas da Conte Corrente xx.xxx-x, referente ao mês de junho de 2026, encontram-se guardados, arquivados em boa ordem e conservação, identificados e à disposição dos condôminos.",
      "A24": "Unidade Executora:",
      "A28": "_______________________________________",
      "G28": "_______________________________________",
      "A29": "Nome",
      "G29": "Nome",
      "A30": "Tesoureiro",
      "G30": "Presidente"
    }
  }
}
