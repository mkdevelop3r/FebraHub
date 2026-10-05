import importlib
import os
import unittest
from unittest.mock import Mock, patch


os.environ.setdefault("SUPABASE_URL", "https://supabase.invalid")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test")
os.environ.setdefault("CRM_TOKEN", "test")
os.environ.setdefault("CRM_LOCATION_ID", "test")

pm = importlib.import_module("etl.pedagogico_mensagens")


def resposta(payload, ok=True, status_code=200):
    r = Mock(ok=ok, status_code=status_code, text="")
    r.json.return_value = payload
    return r


class PedagogicoMensagensTest(unittest.TestCase):
    def setUp(self):
        pm.CAMPOS_CRM.clear()
        pm.CAMPOS_CRM.update(pm.CAMPO_FALLBACK)
        pm.TURMAS_CACHE.clear()

    def test_formatacao_do_template(self):
        self.assertEqual(pm.periodo("2026-10-23", "2026-10-24"),
                         "23 a 24/10/2026")
        self.assertEqual(pm.horario_faixa("9h", "22h"), "9h às 22h")

    @patch.object(pm.requests, "post")
    @patch.object(pm.requests, "get")
    def test_confirma_campos_antes_de_liberar_contato(self, get, post):
        campos_novos = [
            {"id": "local-id", "fieldKey": "contact.pedagogico_local"},
            {"id": "endereco-id", "fieldKey": "contact.pedagogico_endereco"},
        ]
        valores = {
            "curso": "Técnicas de Vendas",
            "datas": "23 a 24/10/2026",
            "horarios": "9h às 22h",
            "credenciamento": "8h30",
            "link_grupo": "https://chat.whatsapp.com/teste",
            "local": "FEBRACIS",
            "endereco": "Av. Manoel Dias da Silva, 1236",
        }
        ids = {**pm.CAMPO_FALLBACK, "local": "local-id",
               "endereco": "endereco-id"}
        persistidos = [{"id": ids[nome], "value": valor}
                       for nome, valor in valores.items()]
        get.side_effect = [
            resposta({"customFields": campos_novos}),
            resposta({"contact": {"customFields": persistidos}}),
        ]
        post.return_value = resposta({"contact": {"id": "contato-1"}})

        contact_id = pm.upsert_contato(
            nome="Miqueias", telefone="5571999999999", email=None,
            curso=valores["curso"], datas=valores["datas"],
            horarios=valores["horarios"],
            credenciamento=valores["credenciamento"],
            link_grupo=valores["link_grupo"], local=valores["local"],
            endereco=valores["endereco"])

        self.assertEqual(contact_id, "contato-1")
        enviados = post.call_args.kwargs["json"]["customFields"]
        self.assertEqual({x["id"] for x in enviados},
                         {ids[nome] for nome in valores})
        self.assertEqual(get.call_count, 2)

    @patch.object(pm.requests, "get")
    def test_completa_turma_com_campos_editaveis(self, get):
        get.return_value = resposta([{
            "turma_id": "2026 - TV09", "curso": "TÉCNICAS DE VENDAS",
            "nome_comercial": "Técnicas de Vendas para Negócios",
            "data_inicio": "2026-10-23", "data_fim": "2026-10-24",
            "horario_credenciamento": "8h30", "horario_inicio": "9h",
            "horario_fim": "22h", "local": "FEBRACIS",
            "endereco": "Av. Manoel Dias da Silva, 1236",
            "link_grupo": "https://chat.whatsapp.com/teste",
        }])
        linha = pm.completar_dados_turma({"turma_id": "2026 - TV09",
                                           "curso": "antigo"})
        self.assertEqual(linha["curso"], "Técnicas de Vendas para Negócios")
        self.assertEqual(linha["local"], "FEBRACIS")
        self.assertIn("Manoel Dias", linha["endereco"])


if __name__ == "__main__":
    unittest.main()
