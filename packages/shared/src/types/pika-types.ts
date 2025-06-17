export interface PikaConfig {
    pika: PikaBackEndConfig;
    pikaChat: PikaChatConfig;
}

export interface PikaBackEndConfig {
    projNameL: string; // All lowercase no stage name e.g. pika
    projNameKebabCase: string; // Kebab case no stage name e.g. pika
    projNameTitleCase: string; // Title case no stage name e.g. Pika
    projNameCamel: string; // Camel case no stage name e.g. pika
    projNameHuman: string; // Human readable no stage name e.g. Pika
}

export interface PikaChatConfig {
    projNameL: string; // All lowercase no stage name e.g. pikachat
    projNameKebabCase: string; // Kebab case no stage name e.g. pika-chat
    projNameTitleCase: string; // Title case no stage name e.g. PikaChat
    projNameCamel: string; // Camel case no stage name e.g. pikaChat
    projNameHuman: string; // Human readable no stage name e.g. Pika Chat
}
