import type { SiteProfile } from "../generated/prisma/client.ts";

export type HeroCollageViewModel = {
  primary: {
    imageUrl: string;
    altText: string;
    caption: string;
  };
  secondary: {
    imageUrl: string;
    altText: string;
    caption: string;
  };
  journal: {
    date: string;
    text: string;
    emphasis: string;
  };
};



export function mapHeroCollageToViewModel(
  profile: SiteProfile
): HeroCollageViewModel {
	if (
		!profile.heroPrimaryImageUrl?.trim() ||
		!profile.heroPrimaryAltText?.trim() ||
		!profile.heroPrimaryCaption?.trim() ||
		!profile.heroSecondaryImageUrl?.trim() ||
		!profile.heroSecondaryAltText?.trim() ||
		!profile.heroSecondaryCaption?.trim() ||
		!profile.heroJournalDate?.trim() ||
		!profile.heroJournalText?.trim() ||
		!profile.heroJournalEmphasis?.trim()
	) {
		throw new Error("Hero collage content is not fully configured.");
	}
  return {
    primary: {
      imageUrl: profile.heroPrimaryImageUrl.trim(),
      altText: profile.heroPrimaryAltText.trim(),
      caption: profile.heroPrimaryCaption.trim()
    },
    secondary: {
      imageUrl: profile.heroSecondaryImageUrl.trim(),
      altText: profile.heroSecondaryAltText.trim(),
      caption: profile.heroSecondaryCaption.trim()
    },
    journal: {
      date: profile.heroJournalDate.trim(),
      text: profile.heroJournalText.trim(),
      emphasis: profile.heroJournalEmphasis.trim()
    }
  };
}