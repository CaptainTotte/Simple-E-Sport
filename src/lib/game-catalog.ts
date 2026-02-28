import { ContextKind, type PrismaClient } from "@prisma/client";

export type GameSeedDefinition = {
  slug: string;
  name: string;
  imageUrl: string;
  randomPoolAllowed: boolean;
  contextKind: ContextKind;
  contextLabelSingular: string;
  contextLabelPlural: string;
  modes: Array<{ code: string; label: string; teamSize: number }>;
  contexts: string[];
};

export const GAME_CATALOG: GameSeedDefinition[] = [
  {
    slug: "counter-strike",
    name: "Counter-Strike",
    imageUrl: "/games/counter-strike.svg",
    randomPoolAllowed: true,
    contextKind: ContextKind.MAP,
    contextLabelSingular: "Map",
    contextLabelPlural: "Maps",
    modes: [{ code: "5v5", label: "5v5", teamSize: 5 }],
    contexts: [
      "Dust II",
      "Mirage",
      "Inferno",
      "Nuke",
      "Ancient",
      "Anubis",
      "Vertigo"
    ]
  },
  {
    slug: "league-of-legends",
    name: "League of Legends",
    imageUrl: "/games/league-of-legends.svg",
    randomPoolAllowed: false,
    contextKind: ContextKind.MAP,
    contextLabelSingular: "Map",
    contextLabelPlural: "Maps",
    modes: [
      { code: "2v2", label: "2v2", teamSize: 2 },
      { code: "3v3", label: "3v3", teamSize: 3 },
      { code: "5v5", label: "5v5", teamSize: 5 }
    ],
    contexts: ["Howling Abyss", "Summoner's Rift"]
  },
  {
    slug: "overwatch",
    name: "Overwatch",
    imageUrl: "/games/overwatch.svg",
    randomPoolAllowed: true,
    contextKind: ContextKind.MAP,
    contextLabelSingular: "Map",
    contextLabelPlural: "Maps",
    modes: [{ code: "5v5", label: "5v5", teamSize: 5 }],
    contexts: ["King's Row", "Route 66", "Ilios", "Lijiang Tower", "Rialto", "Dorado"]
  },
  {
    slug: "minecraft-creative",
    name: "Minecraft (Creative Build Challenge)",
    imageUrl: "/games/minecraft-creative.svg",
    randomPoolAllowed: true,
    contextKind: ContextKind.THEME,
    contextLabelSingular: "Theme",
    contextLabelPlural: "Themes",
    modes: [{ code: "5v5", label: "5v5", teamSize: 5 }],
    contexts: ["Castle", "Space", "Steampunk", "Underwater City", "Fantasy Village", "Futuristic Base"]
  },
  {
    slug: "rocket-league",
    name: "Rocket League",
    imageUrl: "/games/rocket-league.svg",
    randomPoolAllowed: true,
    contextKind: ContextKind.ARENA,
    contextLabelSingular: "Arena",
    contextLabelPlural: "Arenas",
    modes: [
      { code: "2v2", label: "2v2", teamSize: 2 },
      { code: "3v3", label: "3v3", teamSize: 3 }
    ],
    contexts: ["DFH Stadium", "Mannfield", "Champions Field", "Neo Tokyo", "Utopia Coliseum", "Aquadome"]
  },
  {
    slug: "valorant",
    name: "Valorant",
    imageUrl: "/games/valorant.svg",
    randomPoolAllowed: true,
    contextKind: ContextKind.MAP,
    contextLabelSingular: "Map",
    contextLabelPlural: "Maps",
    modes: [{ code: "5v5", label: "5v5", teamSize: 5 }],
    contexts: ["Ascent", "Bind", "Haven", "Split", "Lotus", "Sunset", "Icebox", "Breeze", "Abyss"]
  }
];

export async function upsertGameCatalog(prisma: PrismaClient) {
  for (const game of GAME_CATALOG) {
    const created = await prisma.gameDefinition.upsert({
      where: { slug: game.slug },
      update: {
        name: game.name,
        imageUrl: game.imageUrl,
        randomPoolAllowed: game.randomPoolAllowed,
        contextKind: game.contextKind,
        contextLabelSingular: game.contextLabelSingular,
        contextLabelPlural: game.contextLabelPlural
      },
      create: {
        slug: game.slug,
        name: game.name,
        imageUrl: game.imageUrl,
        randomPoolAllowed: game.randomPoolAllowed,
        contextKind: game.contextKind,
        contextLabelSingular: game.contextLabelSingular,
        contextLabelPlural: game.contextLabelPlural
      }
    });

    const modeCodes = game.modes.map((mode) => mode.code);
    for (const mode of game.modes) {
      await prisma.gameModeDefinition.upsert({
        where: {
          gameId_code: {
            gameId: created.id,
            code: mode.code
          }
        },
        update: {
          label: mode.label,
          teamSize: mode.teamSize,
          isActive: true
        },
        create: {
          gameId: created.id,
          code: mode.code,
          label: mode.label,
          teamSize: mode.teamSize,
          isActive: true
        }
      });
    }

    await prisma.gameModeDefinition.updateMany({
      where: {
        gameId: created.id,
        code: {
          notIn: modeCodes
        }
      },
      data: {
        isActive: false
      }
    });

    const contextNames = game.contexts;
    for (const name of contextNames) {
      await prisma.gameContextItemDefinition.upsert({
        where: {
          gameId_name: {
            gameId: created.id,
            name
          }
        },
        update: {
          kind: game.contextKind,
          isActive: true
        },
        create: {
          gameId: created.id,
          kind: game.contextKind,
          name,
          isActive: true
        }
      });
    }

    await prisma.gameContextItemDefinition.updateMany({
      where: {
        gameId: created.id,
        name: {
          notIn: contextNames
        }
      },
      data: {
        isActive: false
      }
    });
  }
}
