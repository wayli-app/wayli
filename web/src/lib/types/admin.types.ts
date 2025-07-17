export interface AdminUser {
	id: string;
	email: string;
	fullName?: string;
	avatarUrl?: string;
	isAdmin: boolean;
	createdAt: string;
	updatedAt?: string;
	lastSignInAt?: string;
}

export interface AdminUserUpdateRequest {
	userId: string;
	email: string;
	fullName: string;
	role: string;
}

export interface AdminUserDeleteRequest {
	userId: string;
}

export interface AdminStatistics {
	totalUsers: number;
	activeUsers: number;
	newUsersThisMonth: number;
	usersWith2FA: number;
}

export interface AdminUserListResponse {
	users: AdminUser[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
}
