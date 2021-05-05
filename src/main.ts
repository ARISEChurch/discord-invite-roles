require("dotenv").config();

import { Client } from "discord.js";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as IR from "./invite-tracking/invite-roles";
import * as Invites from "./invite-tracking/invites";
import * as K8s from "./k8s";

async function main() {
  const shardConfig = F.pipe(
    K8s.shardConfig(),
    O.fold(
      () => ({}),
      ({ id, count }) => ({
        shards: id,
        shardCount: count,
      }),
    ),
  );

  console.log("Using shard config:", shardConfig);

  const client = new Client({
    ...shardConfig,
  });

  Invites.used$(client)
    .pipe(IR.addRolesFromInvite())
    .subscribe(([member, roles]) => {
      console.log(
        `${member.displayName} added to roles ${roles
          .map((r) => r.name)
          .join(", ")}`,
      );
    });

  await client.login(process.env.DISCORD_BOT_TOKEN);
}

main();
