// rules.js
// Regelsatz für die statische Analyse von FiveM-Ressourcen (Lua/JS/HTML/Manifest).
// Jede Regel beschreibt ein verdächtiges Muster, seinen Schweregrad und eine
// kurze Begründung, warum ein Treffer relevant ist. Die Liste lässt sich
// beliebig erweitern, ohne den Rest der Engine anzufassen.

const CONTENT_RULES = [
  {
    id: 'RCE-001',
    severity: 'critical',
    title: 'Dynamischer Code-Load (loadstring)',
    description:
      'loadstring() führt beliebigen, zur Laufzeit erzeugten Code aus. Sehr häufig in Backdoors verwendet.',
    pattern: /\bloadstring\s*\(/i
  },
  {
    id: 'RCE-002',
    severity: 'critical',
    title: 'Dynamischer Code-Load (load)',
    description: 'load() mit String-Argument kann wie loadstring beliebigen Code ausführen.',
    pattern: /\bload\s*\(\s*['"`]/i
  },
  {
    id: 'RCE-003',
    severity: 'critical',
    title: 'HTTP-Fetch mit anschließender Ausführung',
    description:
      'PerformHttpRequest gefolgt von load/loadstring lädt Code von einem Server nach und führt ihn aus – ein klassisches Nachladen von Schadcode.',
    pattern: /PerformHttpRequest\s*\([\s\S]{0,400}?(loadstring|load)\s*\(/i
  },
  {
    id: 'EXEC-001',
    severity: 'critical',
    title: 'Shell-Befehl über os.execute',
    description:
      'os.execute führt Systembefehle auf dem Host aus. In einer FiveM-Ressource ist das praktisch nie legitim.',
    pattern: /\bos\.execute\s*\(/i
  },
  {
    id: 'EXEC-002',
    severity: 'high',
    title: 'Prozessausführung über io.popen',
    description: 'io.popen startet einen Sub-Prozess und kann zur Systemkompromittierung genutzt werden.',
    pattern: /\bio\.popen\s*\(/i
  },
  {
    id: 'PERSIST-001',
    severity: 'high',
    title: 'Datei-Selbstmodifikation (SaveResourceFile)',
    description:
      'SaveResourceFile kann genutzt werden, um sich selbst neu zu schreiben und so Löschungen zu überleben. Manuelle Prüfung empfohlen.',
    pattern: /\bSaveResourceFile\s*\(/i
  },
  {
    id: 'EXFIL-001',
    severity: 'critical',
    title: 'Fest codierter Discord-Webhook',
    description:
      'Ein im Code eingebetteter Discord-Webhook wird häufig zur Exfiltration von Spielerdaten oder Zugangsdaten genutzt.',
    pattern: /discord(?:app)?\.com\/api\/webhooks\/[A-Za-z0-9_\-/]+/i
  },
  {
    id: 'EXFIL-002',
    severity: 'high',
    title: 'Fest codiertes Telegram-Bot-Token',
    description: 'Ein Telegram-Bot-Token im Code deutet auf einen zweiten, versteckten Kommunikationskanal hin.',
    pattern: /api\.telegram\.org\/bot[A-Za-z0-9_:-]+/i
  },
  {
    id: 'ACE-001',
    severity: 'high',
    title: 'Laufzeit-Rechteausweitung (add_ace/add_principal)',
    description:
      'Wird ACE/Principal zur Laufzeit aus Skriptcode heraus gesetzt statt über die server.cfg, kann das eine versteckte Rechteausweitung sein.',
    pattern: /\badd_(ace|principal)\s*\(/i
  },
  {
    id: 'IDENT-001',
    severity: 'medium',
    title: 'Mögliches Identifier-Harvesting',
    description: 'Spieler-Identifier werden ausgelesen und in der Nähe an einen externen Endpunkt gesendet.',
    pattern: /GetPlayerIdentifier[\s\S]{0,300}?PerformHttpRequest\s*\(/i
  },
  {
    id: 'HEX-001',
    severity: 'medium',
    title: 'Lange Hex-Escape-Sequenz',
    description: 'Viele aneinandergereihte \\xNN-Escapes sind ein typisches Merkmal obfuskierter Nutzlast.',
    pattern: /(?:\\x[0-9a-fA-F]{2}){12,}/
  },
  {
    id: 'MANIFEST-001',
    severity: 'high',
    title: 'Verdächtiger Eintrag im fxmanifest',
    description: 'Ein *_script-Eintrag im Manifest verweist auf eine externe URL statt auf eine lokale Datei.',
    pattern: /(?:server_script|client_script|shared_script)\s*\(?\s*['"]https?:\/\//i,
    fileNames: ['fxmanifest.lua', '__resource.lua']
  }
];

// Domains, deren bloßes Vorkommen im Code sofort als kritisch gilt.
// Erweiterbar über eine eigene /data/blocklist.txt (eine Domain pro Zeile,
// Zeilen mit # werden ignoriert). Die Standardliste enthält öffentlich
// dokumentierte C2-Infrastruktur bekannter FiveM-Backdoor-Kampagnen.
const DEFAULT_BLOCKLIST = ['blum-panel.me', 'warden-panel.me'];

module.exports = { CONTENT_RULES, DEFAULT_BLOCKLIST };
