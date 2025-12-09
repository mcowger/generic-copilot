export const FILENAME_SENSITIVE_KEYWORDS = [
	"_history",
	".bak",
	".bash",
	".crt",
	".db",
	".dump",
	".env",
	".git",
	".gitignore",
	".hg",
	".htaccess",
	".htpasswd",
	".key",
	".log",
	".p12",
	".pem",
	".pfx",
	".pub",
	".sql",
	".sqlite",
	".svn",
	".swp",
	".zsh",
	"api_key",
	"appsettings",
	"auth",
	"authorized_keys",
	"aws",
	"azure",
	"backup",
	"bitbucket",
	"config.",
	"credential",
	"credentials.json",
	"docker-compose",
	"dockerfile",
	"gcloud",
	"google-services",
	"id_dsa",
	"id_ed25519",
	"id_rsa",
	"keystore",
	"known_hosts",
	"oauth",
	"password",
	"php.ini",
	"secret",
	"secrets.json",
	"service-account",
	"settings.py",
	"token",
	"web.config",
	"wp-config",
];

export const completionSystemInstruction = `You are a specialized code completion engine. Your goal is to generate the missing code that bridges the gap between the provided prefix and suffix contexts.
`;

export const completionDescription = "The code snippet that fits exactly between the prefix and suffix."
export function generateCompletionPromptInstruction(
	fileName: string,
	languageId: string,
	prefix: string,
	suffix: string
): string {
	return `
Project Context:
- Filename: ${fileName}
- Language: ${languageId}

[CODE_PREFIX]
${prefix}
[CURSOR]
${suffix}
[CODE_SUFFIX]
`;
}
