
export const FILENAME_SENSITIVE_KEYWORDS = [
    '_history',
    '.bak',
    '.bash',
    '.crt',
    '.db',
    '.dump',
    '.env',
    '.git',
    '.gitignore',
    '.hg',
    '.htaccess',
    '.htpasswd',
    '.key',
    '.log',
    '.p12',
    '.pem',
    '.pfx',
    '.pub',
    '.sql',
    '.sqlite',
    '.svn',
    '.swp',
    '.zsh',
    'api_key',
    'appsettings',
    'auth',
    'authorized_keys',
    'aws',
    'azure',
    'backup',
    'bitbucket',
    'config.',
    'credential',
    'credentials.json',
    'docker-compose',
    'dockerfile',
    'gcloud',
    'google-services',
    'id_dsa',
    'id_ed25519',
    'id_rsa',
    'keystore',
    'known_hosts',
    'oauth',
    'password',
    'php.ini',
    'secret',
    'secrets.json',
    'service-account',
    'settings.py',
    'token',
    'web.config',
    'wp-config'
];

export const FIM_INSTRUCTION = 'You are a code completion assistant\n'
    + 'FIM mode(Fill-In-the-Middle)\n'
    + 'Output format <fim_middle></fim_middle>\n'
    + 'Example output <fim_middle>int x = 1;\\nint y = 1;\\nSystem.out.print("x + y = ", x + y);</fim_middle>\n'
    + 'Always suggest code snippets longer than 9 characters\n'
    + 'Return empty if no valid suggestion <fim_middle></fim_middle>\n'
    + 'Syntax must be valid\n'
    + 'No explanations, only code completions\n'
    + 'Do not add markdown blocks\n';