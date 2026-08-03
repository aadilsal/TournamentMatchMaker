import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { getUserErrorMessage } from '@/lib/api';
import { toast } from '@/components/ui/toast';

export interface AdminMutationOptions<TData, TVariables>
  extends Omit<UseMutationOptions<TData, unknown, TVariables>, 'mutationFn'> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /**
   * Toast shown on success. A function receives the result so counts can be
   * interpolated (e.g. "Expired 3 matches").
   */
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  /** Overrides the message derived from the API error. */
  errorMessage?: string | ((error: unknown, variables: TVariables) => string);
  /** Query keys invalidated after a successful mutation. */
  invalidate?: unknown[][];
  /** Opt out of the automatic error toast (page renders the error inline instead). */
  silentError?: boolean;
}

/**
 * useMutation wrapper that guarantees every admin action reports its outcome.
 * Errors always surface as a toast unless a caller explicitly opts out; the
 * default admin failure mode used to be a silent no-op.
 */
export function useAdminMutation<TData = unknown, TVariables = void>({
  mutationFn,
  successMessage,
  errorMessage,
  invalidate,
  silentError,
  onSuccess,
  onError,
  ...rest
}: AdminMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVariables>({
    ...rest,
    mutationFn,
    onSuccess: (...args: Parameters<NonNullable<typeof onSuccess>>) => {
      const [data, variables] = args;
      if (invalidate) {
        for (const key of invalidate) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }
      if (successMessage) {
        const message =
          typeof successMessage === 'function' ? successMessage(data, variables) : successMessage;
        if (message) toast.success(message);
      }
      return onSuccess?.(...args);
    },
    onError: (...args: Parameters<NonNullable<typeof onError>>) => {
      const [error, variables] = args;
      if (!silentError) {
        const message =
          typeof errorMessage === 'function'
            ? errorMessage(error, variables)
            : errorMessage ?? getUserErrorMessage(error);
        toast.error(message);
      }
      return onError?.(...args);
    },
  });
}
