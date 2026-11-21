#!/usr/bin/env bash
set -e

echo "=== 1. CONFIGURATION DU COMPTE AUDIT (LECTURE SEULE) ==="
sudo useradd -m -s /bin/bash cfitness-audit 2>/dev/null || true
sudo mkdir -p /home/cfitness-audit/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEIDDUaOMEyK2XYbNZuPTjw+TXz3IHRbAyKxS2B2Tvxd cfitness-os-audit-dev-20261120" | sudo tee /home/cfitness-audit/.ssh/authorized_keys >/dev/null
sudo chown -R cfitness-audit:cfitness-audit /home/cfitness-audit/.ssh
sudo chmod 700 /home/cfitness-audit/.ssh
sudo chmod 600 /home/cfitness-audit/.ssh/authorized_keys

sudo usermod -aG docker cfitness-audit 2>/dev/null || true
sudo chmod -R o+rX /opt/cfitness-os 2>/dev/null || true

echo "=== 2. COMPILATION ET DÉPLOIEMENT DU DERNIER BUILD DÉMO ==="
sudo docker compose up -d --build

echo ""
echo "========================================================"
echo " EMPREINTE DE SÉCURITÉ DU SERVEUR (À ENVOYER À DANIEL) :"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null || true
echo "========================================================"
echo ""

echo "=== 3. VISUEL EN DIRECT ACTIVÉ SUR VOTRE ÉCRAN ==="
echo "Vous voyez défiler ci-dessous toutes les actions de Daniel en temps réel :"
echo "------------------------------------------------------------------------"
sudo docker logs -f cfitess-os-aistudio
