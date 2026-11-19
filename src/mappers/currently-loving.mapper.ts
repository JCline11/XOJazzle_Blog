import type { CurrentlyLoving }
  from "../generated/prisma/client.ts";

export type CurrentlyLovingViewModel = {
  title: string;
  coverImageUrl: string;
  coverAltText: string;
  note: string;
};

export function mapCurrentlyLovingToViewModel(
  item: CurrentlyLoving
): CurrentlyLovingViewModel {
  return {
    title: item.title,
    coverImageUrl: item.coverImageUrl,
    coverAltText: item.coverAltText,
    note: item.note
  };
}