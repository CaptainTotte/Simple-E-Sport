import { z } from "zod";

export const createTournamentSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  teamLimit: z.union([z.literal(4), z.literal(8), z.literal(16)]).default(8),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional()
});

export const updateRulesetSchema = z
  .object({
    gameId: z.string().min(1),
    modeId: z.string().min(1),
    poolStrategy: z.enum(["RANDOM", "MANUAL"]),
    randomPoolSize: z.number().int().positive().optional(),
    poolItems: z
      .array(
        z.object({
          contextItemId: z.string().optional(),
          customLabel: z.string().min(1).max(120).optional()
        })
      )
      .optional()
  })
  .superRefine((value, ctx) => {
    if (value.poolStrategy === "MANUAL" && (!value.poolItems || value.poolItems.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["poolItems"],
        message: "Manual strategy requires at least one pool item."
      });
    }
  });

export const registerTeamSchema = z
  .object({
    teamId: z.string().optional(),
    teamName: z.string().min(2).max(80).optional(),
    teamTag: z.string().max(8).optional(),
    playerNames: z.array(z.string().min(2).max(64)).min(1)
  })
  .superRefine((value, ctx) => {
    if (!value.teamId && !value.teamName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teamName"],
        message: "teamName is required when teamId is not provided."
      });
    }
  });

export const reportMatchSchema = z.object({
  winnerTeamId: z.string().min(1),
  scoreA: z.number().int().nonnegative(),
  scoreB: z.number().int().nonnegative(),
  notes: z.string().max(1000).optional(),
  proofs: z
    .array(
      z.object({
        publicUrl: z.string().min(1),
        storageProvider: z.string().default("manual"),
        objectKey: z.string().default("manual")
      })
    )
    .min(1)
});

export const approveReportSchema = z.object({
  approve: z.boolean(),
  decisionNote: z.string().max(1000).optional()
});

export const registerAccountSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only include letters, numbers, _ and -"),
  name: z.string().min(2).max(80),
  password: z.string().min(6).max(128)
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128)
});
