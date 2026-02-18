require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const GUILD_ID = process.env.GUILD_ID;
const MUTE_ROLE_ID = process.env.MUTE_ROLE_ID;
const MUTED_VOICE_CHANNEL_ID = process.env.MUTED_VOICE_CHANNEL_ID;
const MAIN_VOICE_CHANNEL_ID = process.env.MAIN_VOICE_CHANNEL_ID;

// zapamiętujemy skąd przenieśliśmy użytkownika, żeby go potem cofnąć
const lastChannelByUser = new Map(); // userId -> channelId

client.once("ready", () => {
  console.log(`Zalogowano jako: ${client.user.tag}`);
});

// selfMute/selfDeaf zmienia się w voiceStateUpdate
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // tylko na jednym serwerze (żeby nie mieszać)
    if (GUILD_ID && newState.guild.id !== GUILD_ID) return;

    const member = newState.member;
    if (!member) return;

    // ignoruj bota
    if (member.user.bot) return;

    const wasInVoice = !!oldState.channelId;
    const isInVoice = !!newState.channelId;

    // Jeśli ktoś wyszedł z voice – wyczyść pamięć
    if (wasInVoice && !isInVoice) {
      lastChannelByUser.delete(member.id);
      return;
    }

    // interesuje nas tylko sytuacja, gdy ktoś JEST na voice
    if (!isInVoice) return;

    const nowMutedOrDeaf = !!newState.selfMute || !!newState.selfDeaf;
    const wasMutedOrDeaf = !!oldState.selfMute || !!oldState.selfDeaf;

    // 1) ktoś właśnie się WYCISZYŁ (mute lub deaf)
    if (!wasMutedOrDeaf && nowMutedOrDeaf) {
      // zapamiętaj aktualny kanał, o ile to nie jest kanał muted
      if (newState.channelId && newState.channelId !== MUTED_VOICE_CHANNEL_ID) {
        lastChannelByUser.set(member.id, newState.channelId);
      }

      // nadaj rolę GOONER (jeśli nie ma)
      if (!member.roles.cache.has(MUTE_ROLE_ID)) {
        await member.roles.add(MUTE_ROLE_ID, "Auto: self mute/deaf");
      }

      // przenieś na kanał muted (jeśli nie jest już tam)
      if (newState.channelId !== MUTED_VOICE_CHANNEL_ID) {
        await newState.setChannel(MUTED_VOICE_CHANNEL_ID, "Auto-move: self mute/deaf");
      }

      return;
    }

    // 2) ktoś właśnie się ODCISZYŁ (i nie ma już mute ani deaf)
    if (wasMutedOrDeaf && !nowMutedOrDeaf) {
      // zdejmij rolę GOONER (jeśli jest)
      if (member.roles.cache.has(MUTE_ROLE_ID)) {
        await member.roles.remove(MUTE_ROLE_ID, "Auto: unmute/undeaf");
      }

      // wróć na poprzedni kanał, a jak brak to na MAIN
      const backChannelId = lastChannelByUser.get(member.id) || MAIN_VOICE_CHANNEL_ID;

      // jeśli jesteśmy na kanale muted i mamy gdzie wrócić, przenieś
      if (newState.channelId === MUTED_VOICE_CHANNEL_ID && backChannelId && backChannelId !== MUTED_VOICE_CHANNEL_ID) {
        await newState.setChannel(backChannelId, "Auto-return: unmute/undeaf");
      }

      // wyczyść zapamiętany kanał
      lastChannelByUser.delete(member.id);
      return;
    }
  } catch (err) {
    console.error("voiceStateUpdate error:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);