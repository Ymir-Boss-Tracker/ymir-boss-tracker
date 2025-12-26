let currentUser = null;
let isCompactView = false;

// FUNÇÃO DE ENVIO CORRIGIDA (DIVISÃO POR CAMPOS)
async function sendFullReportToDiscord() {
if (!DISCORD_WEBHOOK_URL) return;
const btn = document.getElementById('sync-discord-btn');
@@ -53,42 +52,30 @@ async function sendFullReportToDiscord() {
const active = allBosses.filter(b => b.respawnTime > 0).sort((a, b) => a.respawnTime - b.respawnTime);
const available = allBosses.filter(b => b.respawnTime === 0);

    const embedFields = [];

    // Lógica para Próximos Respawns (com divisão se exceder 1024 caracteres)
    // CONSTRUÇÃO DO TEXTO ÚNICO (Usando Description em vez de Fields)
    let fullDescription = "**⏳ PRÓXIMOS RESPAWNS**\n";
    
if (active.length > 0) {
        let currentText = "";
        let fieldCount = 1;
        
active.forEach(b => {
const timeStr = new Date(b.respawnTime).toLocaleTimeString('pt-BR');
            const line = '• **' + b.name + '** (' + b.typeLabel + ' - ' + b.floor + ') -> **' + timeStr + '**\n';
            
            if ((currentText + line).length > 1000) {
                embedFields.push({ name: "⏳ PRÓXIMOS RESPAWNS (Parte " + fieldCount + ")", value: currentText });
                currentText = line;
                fieldCount++;
            } else {
                currentText += line;
            }
            fullDescription += '• **' + b.name + '** (' + b.typeLabel + ' - ' + b.floor + ') -> **' + timeStr + '**\n';
});
        embedFields.push({ name: fieldCount > 1 ? "⏳ PRÓXIMOS RESPAWNS (Final)" : "⏳ PRÓXIMOS RESPAWNS", value: currentText });
    } else {
        fullDescription += "Nenhum no momento.\n";
}

    // Lógica para Sem Informação
    fullDescription += "\n**⚪ SEM INFORMAÇÃO**\n";
if (available.length > 0) {
        let availText = available.map(b => b.name + ' (' + b.typeLabel + ' - ' + b.floor + ')').join(', ');
        if (availText.length > 1024) {
            availText = availText.substring(0, 1021) + "...";
        }
        embedFields.push({ name: "⚪ SEM INFORMAÇÃO", value: availText });
        fullDescription += available.map(b => b.name + ' (' + b.typeLabel + ' - ' + b.floor + ')').join(', ');
    } else {
        fullDescription += "Nenhum boss disponível.";
}

const payload = {
embeds: [{
title: "⚔️ STATUS DOS BOSSES - LEGEND OF YMIR",
            description: fullDescription.substring(0, 4000), // Limite maior para o corpo da mensagem
color: 5814783,
            fields: embedFields,
footer: { text: 'Enviado por: ' + (currentUser ? currentUser.displayName : 'Sistema') },
timestamp: new Date().toISOString()
}]
@@ -113,7 +100,7 @@ async function sendFullReportToDiscord() {
}
}

// RESTANTE DO CÓDIGO (Igual ao original)
// RESTANTE DAS FUNÇÕES (IGUAL AO ORIGINAL)
document.getElementById('toggle-view-btn').onclick = () => {
isCompactView = !isCompactView;
const container = document.getElementById('boss-list-container');
