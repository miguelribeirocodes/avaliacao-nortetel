Como iniciar:

uvicorn main:app --reload

Como iniciar o venv:

Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
python -m venv .venv
.\.venv\Scripts\Activate.ps1

Requirements:

pip install -r requirements.txt
pip install "python-jose[cryptography]" passlib[bcrypt]

SQL Local:

- Instalar dbeaver
- Instalar postgresql com senha 99062535