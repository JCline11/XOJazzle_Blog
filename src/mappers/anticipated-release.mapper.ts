import type { AnticipatedRelease }
  from "../generated/prisma/client.ts";

export type AnticipatedReleaseViewModel = {
  text: string;
};

export function mapAnticipatedReleaseToViewModel(
  item: AnticipatedRelease
): AnticipatedReleaseViewModel {
  return {
    text: item.text
  };
}