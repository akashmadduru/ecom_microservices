package com.ecom.auth.mapper;

import com.ecom.auth.domain.User;
import com.ecom.auth.dto.UserResponse;
import javax.annotation.processing.Generated;

@Generated(
    value = "org.mapstruct.ap.MappingProcessor",
    date = "2026-08-03T16:09:31+0530",
    comments = "version: 1.6.3, compiler: Eclipse JDT (IDE) 3.46.100.v20260624-0231, environment: Java 21.0.11 (Eclipse Adoptium)"
)
public class UserMapperImpl implements UserMapper {

    @Override
    public User userResponseToUser(UserResponse userResponse) {
        if ( userResponse == null ) {
            return null;
        }

        User user = new User();

        user.setCreatedAt( userResponse.getCreatedAt() );
        user.setEmail( userResponse.getEmail() );
        user.setIsActive( userResponse.getIsActive() );
        user.setProvider( userResponse.getProvider() );
        user.setRole( userResponse.getRole() );
        user.setUpdatedAt( userResponse.getUpdatedAt() );
        user.setUsername( userResponse.getUsername() );

        return user;
    }
}
