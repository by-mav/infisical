import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClockIcon, RefreshCwIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { SecretV3RawResponse } from "@app/hooks/api/secrets/types";

type InventoryRow = {
  id: string;
  key: string;
  path: string;
  environment: string;
  description: string;
  provider: string;
  expiresAt: string;
  expirationStatus: string;
  expirySource: string;
  checkedAt: string;
};

type Props = {
  projectId: string;
  environments: { name: string; slug: string }[];
};

const getMetadata = (
  metadata: { key: string; value: string; isEncrypted?: boolean }[] | undefined,
  key: string
) => metadata?.find((entry) => entry.key === key && !entry.isEncrypted)?.value ?? "";

const dateValue = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const ExpiryInventoryDialog = ({ projectId, environments }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ascending, setAscending] = useState(true);

  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["secret-expiry-inventory", projectId, environments.map(({ slug }) => slug)],
    enabled: isOpen && Boolean(projectId) && environments.length > 0,
    queryFn: async () => {
      const responses = await Promise.all(
        environments.map(({ slug }) =>
          apiRequest.get<SecretV3RawResponse>("/api/v4/secrets", {
            params: {
              projectId,
              environment: slug,
              secretPath: "/",
              recursive: true,
              viewSecretValue: false,
              expandSecretReferences: false,
              include_imports: false
            }
          })
        )
      );

      return responses.flatMap(({ data: response }, index) =>
        response.secrets.map(
          (secret): InventoryRow => ({
            id: secret.id,
            key: secret.secretKey,
            path: secret.secretPath,
            environment: environments[index].name,
            description:
              getMetadata(secret.secretMetadata, "display_name") || secret.secretComment || "",
            provider: getMetadata(secret.secretMetadata, "provider"),
            expiresAt: getMetadata(secret.secretMetadata, "expires_at"),
            expirationStatus: getMetadata(secret.secretMetadata, "expiration_status"),
            expirySource: getMetadata(secret.secretMetadata, "expiry_source"),
            checkedAt: getMetadata(secret.secretMetadata, "checked_at")
          })
        )
      );
    }
  });

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const rows = (data ?? [])
    .filter((row) =>
      [row.key, row.path, row.environment, row.description, row.provider, row.expirationStatus]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    )
    .sort((left, right) => {
      const leftDate = dateValue(left.expiresAt);
      const rightDate = dateValue(right.expiresAt);
      if (leftDate === null && rightDate !== null) return 1;
      if (rightDate === null && leftDate !== null) return -1;
      if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
        return ascending ? leftDate - rightDate : rightDate - leftDate;
      }
      return `${left.path}/${left.key}`.localeCompare(`${right.path}/${right.key}`);
    });

  return (
    <>
      <Button variant="outline" size="xs" onClick={() => setIsOpen(true)}>
        <CalendarClockIcon />
        Expirations
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-[min(96vw,1200px)] flex-col">
          <DialogHeader>
            <DialogTitle>Secret expiration inventory</DialogTitle>
            <DialogDescription>
              Expiration dates recorded in secret metadata. An unknown date is not proof that a key
              never expires.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Filter expiration inventory"
              placeholder="Filter by name, path, provider, or status"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                refetch();
              }}
              isDisabled={isFetching}
            >
              <RefreshCwIcon />
              Refresh
            </Button>
          </div>
          <p className="text-sm text-muted">
            {rows.length} of {data?.length ?? 0} secrets ·{" "}
            {data?.filter((row) => dateValue(row.expiresAt) !== null).length ?? 0} with a recorded
            date
          </p>
          <div className="min-h-0 overflow-auto rounded border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Environment / path</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>
                    <button type="button" onClick={() => setAscending((value) => !value)}>
                      Expires {ascending ? "↑" : "↓"}
                    </button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source / checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending && (
                  <TableRow>
                    <TableCell colSpan={6}>Loading expiration metadata…</TableCell>
                  </TableRow>
                )}
                {isError && (
                  <TableRow>
                    <TableCell colSpan={6}>Could not load the inventory. Try Refresh.</TableCell>
                  </TableRow>
                )}
                {!isPending && !isError && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>No secrets match this filter.</TableCell>
                  </TableRow>
                )}
                {!isError &&
                  rows.map((row) => (
                    <TableRow key={`${row.environment}:${row.path}:${row.id}`}>
                      <TableCell className="max-w-56">
                        <div className="truncate font-mono" title={row.key}>
                          {row.key}
                        </div>
                        {row.description && (
                          <div className="truncate text-muted" title={row.description}>
                            {row.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-48 truncate"
                        title={`${row.environment} ${row.path}`}
                      >
                        {row.environment} · {row.path}
                      </TableCell>
                      <TableCell>{row.provider || "—"}</TableCell>
                      <TableCell className="font-mono whitespace-nowrap">
                        {dateValue(row.expiresAt) === null
                          ? "Unknown"
                          : new Date(row.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-56 truncate" title={row.expirationStatus}>
                        {row.expirationStatus || "Unverified"}
                      </TableCell>
                      <TableCell className="max-w-56">
                        <div className="truncate" title={row.expirySource}>
                          {row.expirySource || "—"}
                        </div>
                        <div className="text-muted">
                          {row.checkedAt
                            ? new Date(row.checkedAt).toLocaleDateString()
                            : "Not checked"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
