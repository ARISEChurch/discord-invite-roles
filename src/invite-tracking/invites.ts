import { Client } from "droff";
import { GuildMemberAddEvent } from "droff/dist/types";
import * as F from "fp-ts/function";
import { sequenceT } from "fp-ts/lib/Apply";
import * as O from "fp-ts/Option";
import { List } from "immutable";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import * as Guilds from "../discord/guilds";
import * as IT from "./invite-tracker";

const usedInvites = (before: IT.TInviteMap, after: IT.TInviteMap) => {
  return after.reduce((invites, invite, code) => {
    const beforeUses = before.get(code)?.uses || 0;
    const afterUses = after.get(code)?.uses || 0;
    return beforeUses < afterUses ? invites.push(invite) : invites;
  }, List<IT.TInviteSummary>());
};

const memberUsedInvite =
  (client: Client) =>
  (tracker: IT.InviteTracker) =>
  async (member: GuildMemberAddEvent): Promise<List<IT.TInviteSummary>> => {
    const before = O.fromNullable(tracker.value.get(member.guild_id));

    return tracker.next(IT.updateGuild(client)(member.guild_id)).then(() => {
      const after = O.fromNullable(tracker.value.get(member.guild_id));

      return F.pipe(
        sequenceT(O.Apply)(before, after),
        O.map(([before, after]) => usedInvites(before, after)),
        O.getOrElse(() => List()),
      );
    });
  };

export const used$ = (client: Client) => {
  const inviteTracker = new IT.InviteTracker();

  Guilds.watchInvites(client).subscribe((guild) => {
    console.log("[invites]", "updating guild", guild.name);
    inviteTracker.next(IT.updateGuild(client)(guild.id));
  });

  client.fromDispatch("GUILD_DELETE").subscribe((guild) => {
    console.log("[invites]", "removing guild", guild.id);
    inviteTracker.next(IT.removeGuild(guild.id));
  });

  return client.fromDispatch("GUILD_MEMBER_ADD").pipe(
    RxO.flatMap((member) =>
      Rx.zip(Rx.of(member), memberUsedInvite(client)(inviteTracker)(member)),
    ),
    RxO.filter(([_, invites]) => invites.count() === 1),
    RxO.map(([member, invites]) => F.tuple(member, invites.get(0)!)),
  );
};
