async function sendDiscordNotification(webhookUrl, scanResult) {
  if (!webhookUrl) return;
  const { summary, findings, targetLabel } = scanResult;

  const topFindings =
    findings
      .filter((f) => f.severity === 'critical' || f.severity === 'high')
      .slice(0, 5)
      .map((f) => `**${f.title}** — \`${f.file}:${f.line}\``)
      .join('\n') || 'Keine kritischen oder hohen Funde.';

  const color = summary.counts.critical > 0 ? 0xff4d6d : summary.counts.high > 0 ? 0xff9f43 : 0x4ade80;

  const embed = {
    title: 'FiveM ScanGuard – Scan abgeschlossen',
    description: `Ziel: \`${targetLabel}\``,
    color,
    fields: [
      { name: 'Risiko-Score', value: String(summary.riskScore), inline: true },
      { name: 'Ressourcen', value: String(summary.resourceCount), inline: true },
      { name: 'Funde gesamt', value: String(summary.findingCount), inline: true },
      { name: 'Kritisch', value: String(summary.counts.critical || 0), inline: true },
      { name: 'Hoch', value: String(summary.counts.high || 0), inline: true },
      { name: 'Mittel', value: String(summary.counts.medium || 0), inline: true },
      { name: 'Auffälligste Funde', value: topFindings }
    ],
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (err) {
    console.error('[discord] Benachrichtigung fehlgeschlagen:', err.message);
  }
}

module.exports = { sendDiscordNotification };
