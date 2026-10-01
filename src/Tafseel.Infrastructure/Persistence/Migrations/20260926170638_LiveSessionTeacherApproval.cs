using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LiveSessionTeacherApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionHistory_Next",
                table: "LiveSessionStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionHistory_Previous",
                table: "LiveSessionStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionBookings_Status",
                table: "LiveSessionBookings");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionHistory_Next",
                table: "LiveSessionStatusHistory",
                sql: "[NextStatus] BETWEEN 0 AND 10");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionHistory_Previous",
                table: "LiveSessionStatusHistory",
                sql: "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 10");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionBookings_Status",
                table: "LiveSessionBookings",
                sql: "[Status] BETWEEN 0 AND 10");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionHistory_Next",
                table: "LiveSessionStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionHistory_Previous",
                table: "LiveSessionStatusHistory");

            migrationBuilder.DropCheckConstraint(
                name: "CK_LiveSessionBookings_Status",
                table: "LiveSessionBookings");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionHistory_Next",
                table: "LiveSessionStatusHistory",
                sql: "[NextStatus] BETWEEN 0 AND 8");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionHistory_Previous",
                table: "LiveSessionStatusHistory",
                sql: "[PreviousStatus] IS NULL OR [PreviousStatus] BETWEEN 0 AND 8");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LiveSessionBookings_Status",
                table: "LiveSessionBookings",
                sql: "[Status] BETWEEN 0 AND 8");
        }
    }
}
