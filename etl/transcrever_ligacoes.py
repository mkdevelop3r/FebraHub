import os, urllib.request, json
exec(open("transcrever_audios.py").read().split("carregar_env()")[0])
carregar_env()
TOKEN = os.environ["BLACK_CRM_TOKEN"]
MSG, LOC = "jYre79GCET1TKy5l7kqm", "JedXhdJDbwOl6lvHCCfj"
req = urllib.request.Request(
    f"https://services.leadconnectorhq.com/conversations/locations/{LOC}/messages/{MSG}/transcription",
    headers={"Authorization": f"Bearer {TOKEN}", "Version": "2021-04-15", "Accept": "*/*",
             "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0 Safari/537.36"})
d = json.loads(urllib.request.urlopen(req, timeout=60).read())
print("tipo:", type(d).__name__, "| itens:", len(d))
print(json.dumps(d[:2], ensure_ascii=False, indent=2))   # dois itens INTEIROS, todos os campos