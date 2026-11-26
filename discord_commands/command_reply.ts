import { APIEmbed } from "discord.js";

export interface CommandReply {
  content?: string;
  embeds?: APIEmbed[];
  ephemeral?: boolean;
}
