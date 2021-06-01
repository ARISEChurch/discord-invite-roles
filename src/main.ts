require("dotenv").config();

import { createClient, Intents } from "droff";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import * as IR from "./invite-tracking/invite-roles";
import * as Invites from "./invite-tracking/invites";
import * as K8s from "./k8s";
import * as Topgg from "@top-gg/sdk";

async function main() {
  const shardConfig = F.pipe(
    K8s.shardConfig(),
    O.getOrElse(() => ({})),
  );

  console.log("[main]", "Using shard config:", shardConfig);

  const client = createClient({
    ...shardConfig,
    token: process.env.DISCORD_BOT_TOKEN!,
    intents: Intents.GUILDS | Intents.GUILD_MEMBERS | Intents.GUILD_INVITES,
  });
  const topgg = new Topgg.Api(process.env.TOPGG_TOKEN!);

  // Debug on SIGUSR2
  Rx.fromEvent(process, "SIGUSR2")
    .pipe(RxO.first())
    .subscribe(() => {
      client.gateway.shards.forEach((shard) => {
        shard.raw$.subscribe(console.log);
      });
    });

  // Post server count to top.gg every 60s or on change
  client.guilds$
    .pipe(
      RxO.auditTime(60000),
      RxO.flatMap((guilds) => {
        const serverCount = guilds.count();
        console.log("[main.ts]", "Updating top.gg server count:", serverCount);
        return topgg.postStats({
          serverCount,
        });
      }),
    )
    .subscribe();

  Invites.used$(client)
    .pipe(IR.addRolesFromInvite(client), RxO.withLatestFrom(client.guilds$))
    .subscribe(([[member, role], guilds]) => {
      const guild = guilds.get(member.guild_id)!;
      console.log(
        "[main]",
        `${guild.name} (${guild.id})`,
        `${member.user!.username} added to role ${role.name}`,
      );
    });
}

main();
