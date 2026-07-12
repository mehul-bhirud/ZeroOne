import { BookingState } from "../../domain/workflows";

export const mockOverlappingBookingConflict = {
  error: {
    code: "BOOKING_OVERLAP",
    message: "That time overlaps an existing booking. Choose a different slot.",
    details: {
      asset: {
        id: "ast_123",
        asset_tag: "AF-0123",
        name: "Sony A7S III Camera",
        category_id: "cat_456",
        is_bookable: true,
      },
      conflicting_booking: {
        id: "bkg_789",
        asset_id: "ast_123",
        start_time: "2026-07-20T10:00:00Z",
        end_time: "2026-07-20T14:00:00Z",
        status: "upcoming" as BookingState,
        booked_by: "usr_999",
      }
    }
  }
};

export const mockBackToBackAllowedFixtures = [
  {
    id: "bkg_789",
    asset_id: "ast_123",
    start_time: "2026-07-20T10:00:00Z",
    end_time: "2026-07-20T14:00:00Z", // Ends exactly when next begins
    status: "upcoming" as BookingState,
    booked_by: "usr_999",
  },
  {
    id: "bkg_790",
    asset_id: "ast_123",
    start_time: "2026-07-20T14:00:00Z", // Starts exactly when previous ends
    end_time: "2026-07-20T18:00:00Z",
    status: "upcoming" as BookingState,
    booked_by: "usr_888",
  }
];
