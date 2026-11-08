from openai import OpenAI

print("Iniciando prueba...")

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="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"
)

print("Enviando solicitud...")

try:
    completion = client.chat.completions.create(
        model="deepseek-ai/deepseek-v4.1-flash",
        messages=[{"role": "user", "content": "Di hola"}],
        max_tokens=50
    )
    print("RESPUESTA COMPLETA:")
    print(completion)
except Exception as e:
    print("ERROR:")
    print(e)